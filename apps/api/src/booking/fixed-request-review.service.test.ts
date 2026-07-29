import type { Prisma } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import type { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { DatabaseService } from '../database/database.service';
import type { FixedAvailabilityService } from './fixed-availability.service';
import {
  FixedRequestReviewCommentInvalidError,
  FixedRequestStateConflictError,
} from './fixed-request.errors';
import { FixedRequestReviewService } from './fixed-request-review.service';

const now = new Date('2026-07-22T04:00:00.000Z');
const context = {
  actorName: '松江客服',
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE' as const,
  siteId: 'site-1',
  userId: 'customer-user-1',
};
const request = {
  currentRuleId: null,
  effectiveFrom: new Date('2026-07-27T00:00:00.000Z'),
  hostId: 'host-1',
  id: 'request-1',
  requestType: 'CREATE',
  reason: '申请固定',
  rowVersion: 1,
  siteId: 'site-1',
  status: 'PENDING',
  submittedByOperatorId: 'operator-1',
  targetArtistId: 'artist-1',
  targetDurationMinutes: 30,
  targetStartMinute: 540,
  targetWeekdays: [1, 3],
};

function createService(options?: {
  appointments?: readonly object[];
  currentRule?: object | null;
  request?: object | null;
  updatedCount?: number;
}) {
  const appointments = options?.appointments ?? [];
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
    fixedAppointmentRequest: {
      create: vi.fn().mockImplementation(({ data }: { data: object }) => ({
        ...request,
        ...data,
        id: 'direct-request-1',
        rowVersion: 1,
        submittedByOperatorId: null,
      })),
      findUnique: vi
        .fn()
        .mockResolvedValue(options?.request === undefined ? request : options.request),
      updateMany: vi.fn().mockResolvedValue({ count: options?.updatedCount ?? 1 }),
    },
    hostProfile: {
      findUnique: vi.fn().mockResolvedValue({ deletedAt: null, siteId: 'site-1' }),
    },
    fixedAppointmentRule: {
      create: vi.fn().mockResolvedValue({ id: 'rule-1' }),
      findUnique: vi.fn().mockResolvedValue(options?.currentRule ?? null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    fixedAppointmentRuleWeekday: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    appointment: {
      findMany: vi.fn().mockResolvedValue(appointments),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const database = {
    transaction: vi.fn((operation: (value: Prisma.TransactionClient) => unknown) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  const availability = {
    getAvailabilityWithClient: vi.fn().mockResolvedValue({
      slots: [{ available: true, earliestStartDate: '2026-07-27', startMinute: 540 }],
      unavailableReason: null,
    }),
  };
  const audit = { append: vi.fn().mockResolvedValue('audit-1') };
  const service = new FixedRequestReviewService(
    audit as unknown as AuditCommandService,
    new AuthorizationPolicyService(),
    availability as unknown as FixedAvailabilityService,
    database as unknown as DatabaseService,
  );
  return { audit, availability, service, transaction };
}

describe('FixedRequestReviewService', () => {
  it('atomically converts a pending hold into an approved fixed rule', async () => {
    const { audit, availability, service, transaction } = createService();

    const result = await service.review(
      context,
      {
        comment: ' 同意固定 ',
        decision: 'APPROVE',
        expectedRowVersion: 1,
        requestId: 'request-1',
      },
      now,
    );

    expect(result).toEqual({
      cancelledAppointmentCount: 0,
      fixedRuleId: 'rule-1',
      id: 'request-1',
      reviewComment: '同意固定',
      reviewedAt: '2026-07-22T04:00:00.000Z',
      rowVersion: 2,
      status: 'APPROVED',
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(10);
    expect(availability.getAvailabilityWithClient).toHaveBeenCalledWith(
      transaction,
      context,
      {
        artistId: 'artist-1',
        durationMinutes: 30,
        hostId: 'host-1',
        requestedStartDate: new Date('2026-07-27T00:00:00.000Z'),
        weekdays: [1, 3],
      },
      now,
      { excludeRequestId: 'request-1' },
    );
    expect(transaction.fixedAppointmentRule.create.mock.calls[0]?.[0]).toMatchObject({
      data: { sourceRequestId: 'request-1', startMinute: 540, validFrom: request.effectiveFrom },
    });
    expect(transaction.fixedAppointmentRuleWeekday.createMany.mock.calls[0]?.[0]).toMatchObject({
      data: [
        { isoWeekday: 1, ruleId: 'rule-1' },
        { isoWeekday: 3, ruleId: 'rule-1' },
      ],
    });
    expect(transaction.fixedAppointmentRequest.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.fixedAppointmentRule.create.mock.invocationCallOrder[0]!,
    );
    expect(audit.append).toHaveBeenCalledOnce();
  });

  it('creates and approves a backoffice fixed rule in one transaction', async () => {
    const { service, transaction } = createService();

    await expect(
      service.direct(
        context,
        {
          artistId: 'artist-1',
          durationMinutes: 30,
          effectiveFrom: new Date('2026-07-27T00:00:00.000Z'),
          hostId: 'host-1',
          reason: ' 客服直接设置 ',
          requestType: 'CREATE',
          startMinute: 540,
          weekdays: [1, 3],
        },
        now,
      ),
    ).resolves.toMatchObject({
      fixedRuleId: 'rule-1',
      reviewComment: '客服直接设置',
      status: 'APPROVED',
    });

    expect(transaction.fixedAppointmentRequest.create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        status: 'PENDING',
        submittedByOperatorId: null,
        submittedByUserId: context.userId,
      },
    });
    expect(transaction.fixedAppointmentRequest.updateMany).toHaveBeenCalledOnce();
  });

  it('rejects with a required comment and releases the hold without creating a rule', async () => {
    const { availability, service, transaction } = createService();

    await expect(
      service.review(
        context,
        {
          comment: '时间不合适',
          decision: 'REJECT',
          expectedRowVersion: 1,
          requestId: 'request-1',
        },
        now,
      ),
    ).resolves.toMatchObject({
      cancelledAppointmentCount: 0,
      fixedRuleId: null,
      status: 'REJECTED',
    });

    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(availability.getAvailabilityWithClient).not.toHaveBeenCalled();
    expect(transaction.fixedAppointmentRule.create).not.toHaveBeenCalled();
    expect(transaction.fixedAppointmentRequest.updateMany.mock.calls[0]?.[0]).toMatchObject({
      data: { reviewComment: '时间不合适', status: 'REJECTED' },
    });
  });

  it('enforces site scope, row version and rejection comments', async () => {
    const crossSite = createService();
    await expect(
      crossSite.service.review(
        { ...context, siteId: 'site-2' },
        { decision: 'APPROVE', expectedRowVersion: 1, requestId: 'request-1' },
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    const stale = createService();
    await expect(
      stale.service.review(
        context,
        { decision: 'APPROVE', expectedRowVersion: 2, requestId: 'request-1' },
        now,
      ),
    ).rejects.toBeInstanceOf(FixedRequestStateConflictError);

    const invalidComment = createService();
    expect(() =>
      invalidComment.service.review(
        context,
        { decision: 'REJECT', expectedRowVersion: 1, requestId: 'request-1' },
        now,
      ),
    ).toThrow(FixedRequestReviewCommentInvalidError);
  });

  it('ends the old rule, cancels future instances and creates the replacement on change', async () => {
    const changeRequest = {
      ...request,
      currentRuleId: 'old-rule',
      requestType: 'CHANGE',
    };
    const currentRule = {
      artistId: 'artist-1',
      durationMinutes: 30,
      hostId: 'host-1',
      id: 'old-rule',
      siteId: 'site-1',
      startMinute: 480,
      status: 'ACTIVE',
      validFrom: new Date('2026-07-23T00:00:00.000Z'),
      weekdays: [{ isoWeekday: 1 }, { isoWeekday: 3 }],
    };
    const appointment = {
      appointmentDate: new Date('2026-07-27T00:00:00.000Z'),
      artistId: 'artist-1',
      hostId: 'host-1',
      id: 'appointment-1',
      rowVersion: 1,
      siteId: 'site-1',
      status: 'BOOKED',
    };
    const { audit, availability, service, transaction } = createService({
      appointments: [appointment],
      currentRule,
      request: changeRequest,
    });

    await expect(
      service.review(
        context,
        { decision: 'APPROVE', expectedRowVersion: 1, requestId: 'request-1' },
        now,
      ),
    ).resolves.toMatchObject({ cancelledAppointmentCount: 1, fixedRuleId: 'rule-1' });

    expect(availability.getAvailabilityWithClient).toHaveBeenCalledWith(
      transaction,
      context,
      expect.any(Object),
      now,
      { excludeRequestId: 'request-1', excludeRuleId: 'old-rule' },
    );
    expect(transaction.fixedAppointmentRule.updateMany.mock.calls[0]?.[0]).toMatchObject({
      data: {
        endedByRequestId: 'request-1',
        status: 'ENDED',
        validUntil: changeRequest.effectiveFrom,
      },
    });
    expect(transaction.fixedAppointmentRuleWeekday.updateMany).toHaveBeenCalledWith({
      data: { validUntil: changeRequest.effectiveFrom },
      where: { ruleId: 'old-rule', validUntil: null },
    });
    expect(transaction.appointment.updateMany.mock.calls[0]?.[0]).toMatchObject({
      data: {
        cancellationReasonCode: 'FIXED_RULE_CHANGED',
        cancellationSourceId: 'request-1',
        cancellationSourceType: 'FIXED_REQUEST',
        status: 'CANCELLED',
      },
    });
    expect(audit.append).toHaveBeenCalledTimes(2);
  });

  it('ends the old rule without creating a replacement on cancellation', async () => {
    const cancelRequest = {
      ...request,
      currentRuleId: 'old-rule',
      requestType: 'CANCEL',
      targetArtistId: null,
      targetDurationMinutes: null,
      targetStartMinute: null,
      targetWeekdays: [],
    };
    const currentRule = {
      artistId: 'artist-old',
      durationMinutes: 30,
      hostId: 'host-1',
      id: 'old-rule',
      siteId: 'site-1',
      startMinute: 480,
      status: 'ACTIVE',
      validFrom: new Date('2026-07-23T00:00:00.000Z'),
      weekdays: [{ isoWeekday: 1 }, { isoWeekday: 3 }],
    };
    const { availability, service, transaction } = createService({
      currentRule,
      request: cancelRequest,
    });

    await expect(
      service.review(
        context,
        { decision: 'APPROVE', expectedRowVersion: 1, requestId: 'request-1' },
        now,
      ),
    ).resolves.toMatchObject({ cancelledAppointmentCount: 0, fixedRuleId: null });

    expect(availability.getAvailabilityWithClient).not.toHaveBeenCalled();
    expect(transaction.fixedAppointmentRule.create).not.toHaveBeenCalled();
    expect(transaction.fixedAppointmentRule.updateMany).toHaveBeenCalledOnce();
  });
});
