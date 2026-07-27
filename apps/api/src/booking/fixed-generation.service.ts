import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { ArtistAvailabilityService } from '../availability/artist-availability.service';
import { AuditCommandService } from '../audit/audit-command.service';
import { DatabaseService } from '../database/database.service';
import { isHostQualifiedOn } from '../master-data/host-qualification';
import { acquireTransactionLock } from '../database/transaction-lock';
import {
  businessDateMinuteToInstant,
  formatDateOnly,
  isoWeekdayForDate,
  toBusinessDate,
} from '../shift/business-date';
import type { FixedGenerationResult, FixedGenerationSkipReason } from './fixed-generation.types';

const DAY_MS = 86_400_000;

const RULE_SELECT = {
  artist: { select: { nickname: true } },
  artistId: true,
  durationMinutes: true,
  host: {
    select: {
      hostCode: true,
      nickname: true,
      qualificationStatus: true,
      qualificationValidUntil: true,
      realName: true,
      site: { select: { name: true, status: true } },
    },
  },
  hostId: true,
  id: true,
  siteId: true,
  startMinute: true,
  validFrom: true,
  validUntil: true,
  weekdays: { select: { isoWeekday: true } },
} satisfies Prisma.FixedAppointmentRuleSelect;

type RuleRecord = Prisma.FixedAppointmentRuleGetPayload<{ select: typeof RULE_SELECT }>;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function emptySkipped(): Record<FixedGenerationSkipReason, number> {
  return {
    ALREADY_PROCESSED: 0,
    ARTIST_UNAVAILABLE: 0,
    HOST_DAILY_LIMIT: 0,
    HOST_UNAVAILABLE: 0,
    SLOT_CONFLICT: 0,
  };
}

@Injectable()
export class FixedGenerationService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly availability: ArtistAvailabilityService,
    private readonly database: DatabaseService,
  ) {}

  async run(now = new Date()): Promise<FixedGenerationResult> {
    const today = toBusinessDate(now);
    const windowFrom = addDays(today, 1);
    const windowThrough = addDays(today, 8);
    const rules = await this.database.read((client) =>
      client.fixedAppointmentRule.findMany({
        select: { id: true, validFrom: true, validUntil: true, weekdays: true },
        where: {
          validFrom: { lte: windowThrough },
          OR: [{ validUntil: null }, { validUntil: { gt: windowFrom } }],
        },
      }),
    );
    const skipped = emptySkipped();
    let generated = 0;
    for (const rule of rules) {
      const weekdays = new Set(rule.weekdays.map((weekday) => weekday.isoWeekday));
      const start = new Date(Math.max(windowFrom.getTime(), rule.validFrom.getTime()));
      const end = new Date(
        Math.min(
          windowThrough.getTime(),
          rule.validUntil ? rule.validUntil.getTime() - DAY_MS : windowThrough.getTime(),
        ),
      );
      for (let date = start; date <= end; date = addDays(date, 1)) {
        if (!weekdays.has(isoWeekdayForDate(date))) continue;
        const outcome = await this.generateDate(rule.id, date);
        if (outcome === null) generated += 1;
        else skipped[outcome] += 1;
      }
    }
    return {
      generated,
      skipped,
      windowFrom: formatDateOnly(windowFrom),
      windowThrough: formatDateOnly(windowThrough),
    };
  }

  private generateDate(ruleId: string, date: Date): Promise<FixedGenerationSkipReason | null> {
    return this.database
      .transaction(async (transaction) => {
        await acquireTransactionLock(
          transaction,
          `fixed:generation:${ruleId}:${formatDateOnly(date)}`,
        );
        const rule = await transaction.fixedAppointmentRule.findFirst({
          select: RULE_SELECT,
          where: {
            id: ruleId,
            validFrom: { lte: date },
            OR: [{ validUntil: null }, { validUntil: { gt: date } }],
            weekdays: { some: { isoWeekday: isoWeekdayForDate(date) } },
          },
        });
        if (!rule) return 'ALREADY_PROCESSED';
        await this.lockSchedule(transaction, rule, date);
        const stillEffective = await transaction.fixedAppointmentRule.findFirst({
          select: { id: true },
          where: {
            id: rule.id,
            validFrom: { lte: date },
            OR: [{ validUntil: null }, { validUntil: { gt: date } }],
            weekdays: { some: { isoWeekday: isoWeekdayForDate(date) } },
          },
        });
        if (!stillEffective) return 'ALREADY_PROCESSED';
        const existing = await transaction.appointment.findFirst({
          select: { id: true },
          where: { appointmentDate: date, fixedRuleId: rule.id },
        });
        if (existing) return 'ALREADY_PROCESSED';

        const artistAvailability = await this.availability.getDayWithClient(
          transaction,
          rule.artistId,
          date,
        );
        if (
          !artistAvailability.available ||
          !artistAvailability.intervals.some(
            (interval) =>
              interval.startMinute <= rule.startMinute &&
              rule.startMinute + rule.durationMinutes <= interval.endMinute,
          )
        ) {
          return 'ARTIST_UNAVAILABLE';
        }
        const hostLeave = await transaction.leaveRecord.findFirst({
          select: { id: true },
          where: {
            endDate: { gte: date },
            hostId: rule.hostId,
            startDate: { lte: date },
            status: 'ACTIVE',
          },
        });
        if (
          hostLeave ||
          !isHostQualifiedOn(rule.host, date) ||
          rule.host.site.status !== 'ACTIVE'
        ) {
          return 'HOST_UNAVAILABLE';
        }

        const startAt = businessDateMinuteToInstant(date, rule.startMinute);
        const endAt = new Date(startAt.getTime() + rule.durationMinutes * 60_000);
        const active = await transaction.appointment.findMany({
          orderBy: { dailySequence: 'asc' },
          select: { dailySequence: true, endAt: true, hostId: true, startAt: true },
          where: {
            appointmentDate: date,
            OR: [{ artistId: rule.artistId }, { hostId: rule.hostId }],
            status: { in: ['BOOKED', 'COMPLETED'] },
          },
        });
        if (active.some((item) => startAt < item.endAt && item.startAt < endAt)) {
          return 'SLOT_CONFLICT';
        }
        const hostAppointments = active.filter((item) => item.hostId === rule.hostId);
        if (hostAppointments.length >= 2) return 'HOST_DAILY_LIMIT';
        const dailySequence = hostAppointments.some((item) => item.dailySequence === 1) ? 2 : 1;
        const operator = await transaction.hostOperatorRelation.findFirst({
          orderBy: { validFrom: 'desc' },
          select: { operator: { select: { id: true, realName: true } } },
          where: {
            hostId: rule.hostId,
            operator: { employmentStatus: 'ACTIVE', siteId: rule.siteId },
            validFrom: { lte: date },
            OR: [{ validUntil: null }, { validUntil: { gt: date } }],
          },
        });
        const appointment = await transaction.appointment.create({
          data: {
            appointmentDate: date,
            appointmentType: 'FIXED',
            artistId: rule.artistId,
            artistNicknameSnapshot: rule.artist.nickname,
            createdByRole: 'SYSTEM',
            dailySequence,
            durationMinutes: rule.durationMinutes,
            endAt,
            fixedRuleId: rule.id,
            hostCodeSnapshot: rule.host.hostCode,
            hostId: rule.hostId,
            hostNameSnapshot: rule.host.nickname ?? rule.host.realName,
            operatorIdAtBooking: operator?.operator.id ?? null,
            operatorNameSnapshot: operator?.operator.realName ?? null,
            siteId: rule.siteId,
            siteNameSnapshot: rule.host.site.name,
            startAt,
          },
          select: { id: true },
        });
        await this.audit.append(
          transaction,
          { actorName: '固定预约生成任务', roleCode: 'SYSTEM' },
          {
            action: 'FIXED_APPOINTMENT_GENERATED',
            afterData: {
              artistId: rule.artistId,
              date: formatDateOnly(date),
              fixedRuleId: rule.id,
              hostId: rule.hostId,
            },
            objectId: appointment.id,
            objectType: 'APPOINTMENT',
            siteId: rule.siteId,
          },
        );
        return null;
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return 'ALREADY_PROCESSED';
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2004') {
          return 'SLOT_CONFLICT';
        }
        throw error;
      });
  }

  private async lockSchedule(
    transaction: Prisma.TransactionClient,
    rule: RuleRecord,
    date: Date,
  ): Promise<void> {
    const formattedDate = formatDateOnly(date);
    const keys = [
      `appointment:artist:${rule.artistId}:${formattedDate}`,
      `appointment:host:${rule.hostId}:${formattedDate}`,
    ];
    for (
      let minute = rule.startMinute;
      minute < rule.startMinute + rule.durationMinutes;
      minute += 15
    ) {
      const weekday = isoWeekdayForDate(date);
      keys.push(`fixed:artist:${rule.artistId}:${weekday}:${minute}`);
      keys.push(`fixed:host:${rule.hostId}:${weekday}:${minute}`);
    }
    for (const key of keys.sort()) await acquireTransactionLock(transaction, key);
  }
}
