import type { DatabaseClient, Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { formatDateOnly, toBusinessDate } from './business-date';
import {
  InitialShiftAlreadyConfiguredError,
  ShiftArtistNotFoundError,
  ShiftArtistUnavailableError,
} from './shift.errors';
import { validateShiftDefinition } from './shift-time';
import type {
  ArtistShiftSummary,
  SetInitialShiftCommand,
  ShiftCommandContext,
} from './shift.types';

const ARTIST_ACCESS_SELECT = {
  employmentStatus: true,
  id: true,
  siteId: true,
  userId: true,
} satisfies Prisma.ArtistProfileSelect;

const SHIFT_SELECT = {
  artistId: true,
  breakEndMinute: true,
  breakStartMinute: true,
  id: true,
  validFrom: true,
  validUntil: true,
  versionNo: true,
  workEndMinute: true,
  workStartMinute: true,
  workdays: true,
} satisfies Prisma.ArtistShiftTemplateSelect;

type ArtistAccessRecord = Prisma.ArtistProfileGetPayload<{ select: typeof ARTIST_ACCESS_SELECT }>;
type ShiftRecord = Prisma.ArtistShiftTemplateGetPayload<{ select: typeof SHIFT_SELECT }>;

@Injectable()
export class ArtistShiftService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  setInitialShift(
    context: ShiftCommandContext,
    command: SetInitialShiftCommand,
    now = new Date(),
  ): Promise<ArtistShiftSummary> {
    validateShiftDefinition(command);
    const validFrom = toBusinessDate(now);

    return this.database.transaction(async (transaction) => {
      const artist = await this.findArtist(transaction, command.artistId);
      this.assertFullShiftAccess(context, artist);
      if (artist.employmentStatus !== 'ACTIVE') {
        throw new ShiftArtistUnavailableError();
      }

      const claim = await transaction.artistProfile.updateMany({
        data: { initialShiftConfiguredAt: now, rowVersion: { increment: 1 } },
        where: {
          employmentStatus: 'ACTIVE',
          id: artist.id,
          initialShiftConfiguredAt: null,
        },
      });
      if (claim.count !== 1) {
        throw new InitialShiftAlreadyConfiguredError();
      }

      const shift = await transaction.artistShiftTemplate.create({
        data: {
          artistId: artist.id,
          breakEndMinute: command.breakEndMinute,
          breakStartMinute: command.breakStartMinute,
          createdByUserId: context.userId,
          validFrom,
          versionNo: 1,
          workEndMinute: command.workEndMinute,
          workStartMinute: command.workStartMinute,
          workdays: [...command.workdays].sort((left, right) => left - right),
        },
        select: SHIFT_SELECT,
      });

      const summary = this.toSummary(shift, artist.siteId);
      await this.audit.append(transaction, context, {
        action: 'ARTIST_INITIAL_SHIFT_CONFIGURED',
        afterData: {
          ...summary,
          initialShiftConfiguredAt: now.toISOString(),
        },
        objectId: shift.id,
        objectType: 'ARTIST_SHIFT_TEMPLATE',
        siteId: artist.siteId,
      });

      return summary;
    });
  }

  getCurrentShift(
    context: VerifiedAuthorizationContext,
    artistId: string,
    now = new Date(),
  ): Promise<ArtistShiftSummary | null> {
    const asOf = toBusinessDate(now);

    return this.database.read(async (client) => {
      const artist = await this.findArtist(client, artistId);
      this.assertFullShiftAccess(context, artist);
      const shift = await client.artistShiftTemplate.findFirst({
        orderBy: { versionNo: 'desc' },
        select: SHIFT_SELECT,
        where: {
          artistId,
          OR: [{ validUntil: null }, { validUntil: { gt: asOf } }],
          validFrom: { lte: asOf },
        },
      });

      return shift ? this.toSummary(shift, artist.siteId) : null;
    });
  }

  private assertFullShiftAccess(
    context: VerifiedAuthorizationContext,
    artist: ArtistAccessRecord,
  ): void {
    if (context.roleCode === 'ARTIST') {
      if (artist.userId !== context.userId) {
        throw new AuthorizationDeniedError();
      }
      return;
    }

    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    this.authorization.assertSiteScope(context, artist.siteId);
  }

  private async findArtist(
    client: DatabaseClient | Prisma.TransactionClient,
    artistId: string,
  ): Promise<ArtistAccessRecord> {
    const artist = await client.artistProfile.findUnique({
      select: ARTIST_ACCESS_SELECT,
      where: { id: artistId },
    });
    if (!artist) {
      throw new ShiftArtistNotFoundError();
    }
    return artist;
  }

  private toSummary(shift: ShiftRecord, siteId: string): ArtistShiftSummary {
    return {
      artistId: shift.artistId,
      breakEndMinute: shift.breakEndMinute,
      breakStartMinute: shift.breakStartMinute,
      id: shift.id,
      siteId,
      validFrom: formatDateOnly(shift.validFrom),
      validUntil: shift.validUntil ? formatDateOnly(shift.validUntil) : null,
      versionNo: shift.versionNo,
      workEndMinute: shift.workEndMinute,
      workStartMinute: shift.workStartMinute,
      workdays: shift.workdays,
    };
  }
}
