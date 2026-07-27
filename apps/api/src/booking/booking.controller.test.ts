import { describe, expect, it, vi } from 'vitest';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';

import type { AccessTokenClaims } from '../auth/auth-session.types';
import type { MasterDataCommandContextService } from '../master-data/master-data-command-context.service';
import type { AppointmentQueryService } from './appointment-query.service';
import type { BookingCreateService } from './booking-create.service';
import type { BookingCancelService } from './booking-cancel.service';
import type { BookingCommandContext } from './booking-create.types';
import { BookingController } from './booking.controller';
import type { BookingRescheduleService } from './booking-reschedule.service';
import type { BookingSlotService } from './booking-slot.service';

const artistId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';
const hostId = '019f7a18-6845-7a90-94cb-e5f5caabd5f6';
const authorization: AccessTokenClaims = {
  expiresAt: new Date('2026-07-22T07:00:00.000Z'),
  roleAssignmentId: 'role-host',
  roleCode: 'HOST',
  sessionId: 'session-1',
  siteId: 'site-1',
  userId: 'user-host',
};
const context: BookingCommandContext = { actorName: '小雨', ...authorization };

describe('BookingController', () => {
  it('returns OK when cancelling an existing appointment', () => {
    const cancelHandler = Object.getOwnPropertyDescriptor(BookingController.prototype, 'cancel')
      ?.value as BookingController['cancel'];

    expect(Reflect.getMetadata(HTTP_CODE_METADATA, cancelHandler)).toBe(200);
  });

  it('lists appointments using verified identity and a strict date range', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });
    const controller = new BookingController(
      { list } as unknown as AppointmentQueryService,
      {} as BookingCancelService,
      {} as MasterDataCommandContextService,
      {} as BookingCreateService,
      {} as BookingRescheduleService,
      {} as BookingSlotService,
    );

    await controller.listAppointments(
      { fromDate: '2026-07-23', pageSize: '50', toDate: '2026-07-29' },
      authorization,
    );

    expect(list).toHaveBeenCalledWith(authorization, {
      fromDate: new Date('2026-07-23T00:00:00.000Z'),
      page: 1,
      pageSize: 50,
      toDate: new Date('2026-07-29T00:00:00.000Z'),
    });
  });

  it('queries slots using only verified identity and strict parsed filters', async () => {
    const getSlots = vi.fn().mockResolvedValue({ slots: [] });
    const controller = new BookingController(
      {} as AppointmentQueryService,
      {} as BookingCancelService,
      {} as MasterDataCommandContextService,
      {} as BookingCreateService,
      {} as BookingRescheduleService,
      { getSlots } as unknown as BookingSlotService,
    );

    await controller.listSlots(
      { artistId, date: '2026-07-23', durationMinutes: '30', hostId },
      authorization,
    );

    expect(getSlots).toHaveBeenCalledWith(authorization, {
      artistId,
      date: new Date('2026-07-23T00:00:00.000Z'),
      durationMinutes: 30,
      hostId,
    });
  });

  it('creates through a trusted mini-program context and header idempotency key', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const create = vi.fn().mockResolvedValue({ appointment: { id: 'appointment-1' } });
    const controller = new BookingController(
      {} as AppointmentQueryService,
      {} as BookingCancelService,
      { resolve } as unknown as MasterDataCommandContextService,
      { create } as unknown as BookingCreateService,
      {} as BookingRescheduleService,
      {} as BookingSlotService,
    );

    await controller.create(
      { artistId, date: '2026-07-23', durationMinutes: 30, hostId, startMinute: 570 },
      'booking-key-0001',
      authorization,
      '127.0.0.1',
      'mobile-web',
      'request-1',
    );

    expect(resolve).toHaveBeenCalledWith(authorization, {
      clientType: 'MOBILE_WEB',
      ipAddress: '127.0.0.1',
      requestId: 'request-1',
      userAgent: 'mobile-web',
    });
    expect(create).toHaveBeenCalledWith(context, {
      artistId,
      confirmedSecondBooking: false,
      date: new Date('2026-07-23T00:00:00.000Z'),
      durationMinutes: 30,
      hostId,
      idempotencyKey: 'booking-key-0001',
      startMinute: 570,
    });
  });

  it('marks customer service requests as backoffice traffic', async () => {
    const customerService = {
      ...authorization,
      roleCode: 'CUSTOMER_SERVICE',
      userId: 'user-customer-service',
    } as const;
    const resolve = vi.fn().mockResolvedValue({ actorName: '松江客服', ...customerService });
    const controller = new BookingController(
      {} as AppointmentQueryService,
      {} as BookingCancelService,
      { resolve } as unknown as MasterDataCommandContextService,
      { create: vi.fn().mockResolvedValue({}) } as unknown as BookingCreateService,
      {} as BookingRescheduleService,
      {} as BookingSlotService,
    );

    await controller.create(
      { artistId, date: '2026-07-23', durationMinutes: 30, hostId, startMinute: 570 },
      'booking-key-0001',
      customerService,
      '127.0.0.1',
    );

    expect(resolve).toHaveBeenCalledWith(customerService, {
      clientType: 'ADMIN_WEB',
      ipAddress: '127.0.0.1',
    });
  });

  it('cancels with strict concurrency fields through the same trusted context', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const cancel = vi.fn().mockResolvedValue({ id: 'appointment-1', status: 'CANCELLED' });
    const controller = new BookingController(
      {} as AppointmentQueryService,
      { cancel } as unknown as BookingCancelService,
      { resolve } as unknown as MasterDataCommandContextService,
      {} as BookingCreateService,
      {} as BookingRescheduleService,
      {} as BookingSlotService,
    );

    await controller.cancel(
      artistId,
      { expectedRowVersion: 1, reason: ' 临时有事 ' },
      authorization,
      '127.0.0.1',
    );

    expect(cancel).toHaveBeenCalledWith(context, {
      appointmentId: artistId,
      expectedRowVersion: 1,
      reason: ' 临时有事 ',
    });
  });

  it('reschedules using a path identity, row version and idempotency header', async () => {
    const resolve = vi.fn().mockResolvedValue(context);
    const reschedule = vi.fn().mockResolvedValue({ appointment: { id: 'replacement-1' } });
    const controller = new BookingController(
      {} as AppointmentQueryService,
      {} as BookingCancelService,
      { resolve } as unknown as MasterDataCommandContextService,
      {} as BookingCreateService,
      { reschedule } as unknown as BookingRescheduleService,
      {} as BookingSlotService,
    );

    await controller.reschedule(
      artistId,
      {
        artistId,
        confirmedSecondBooking: true,
        date: '2026-07-24',
        durationMinutes: 45,
        expectedRowVersion: 1,
        startMinute: 570,
      },
      'reschedule-key-0001',
      authorization,
      '127.0.0.1',
    );

    expect(reschedule).toHaveBeenCalledWith(context, {
      appointmentId: artistId,
      artistId,
      confirmedSecondBooking: true,
      date: new Date('2026-07-24T00:00:00.000Z'),
      durationMinutes: 45,
      expectedRowVersion: 1,
      idempotencyKey: 'reschedule-key-0001',
      startMinute: 570,
    });
  });
});
