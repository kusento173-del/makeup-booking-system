import type { DatabaseClient } from '@makeup/database';
import { describe, expect, it, vi } from 'vitest';

import { AuthorizationDeniedError } from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import type { DatabaseService } from '../database/database.service';
import { AppointmentQueryService } from './appointment-query.service';

const now = new Date('2026-07-23T02:00:00.000Z');
const input = {
  fromDate: new Date('2026-07-23T00:00:00.000Z'),
  page: 1,
  pageSize: 50,
  toDate: new Date('2026-07-29T00:00:00.000Z'),
};
const context: VerifiedAuthorizationContext = {
  roleAssignmentId: 'role-1',
  roleCode: 'HOST',
  siteId: 'site-1',
  userId: 'host-user-1',
};
const appointment = {
  appointmentDate: new Date('2026-07-23T00:00:00.000Z'),
  appointmentType: 'SINGLE',
  artistId: 'artist-1',
  artistNicknameSnapshot: '柔柔',
  dailySequence: 1,
  durationMinutes: 30,
  endAt: new Date('2026-07-23T01:30:00.000Z'),
  hostCodeSnapshot: 'ZB01001',
  hostId: 'host-1',
  hostNameSnapshot: '小雨',
  id: 'appointment-1',
  operatorIdAtBooking: 'operator-1',
  operatorNameSnapshot: '运营甲',
  rescheduledFromAppointmentId: null,
  rowVersion: 1,
  siteId: 'site-1',
  siteNameSnapshot: '松江场地',
  startAt: new Date('2026-07-23T01:00:00.000Z'),
  status: 'BOOKED',
};

function createService(options?: { appointment?: object; relations?: readonly object[] }) {
  const client = {
    appointment: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([options?.appointment ?? appointment]),
    },
    hostOperatorRelation: {
      findMany: vi.fn().mockResolvedValue(options?.relations ?? []),
    },
  };
  const database = {
    read: vi.fn((operation: (value: DatabaseClient) => unknown) =>
      operation(client as unknown as DatabaseClient),
    ),
  };
  return {
    client,
    service: new AppointmentQueryService(database as unknown as DatabaseService),
  };
}

function whereParts(client: ReturnType<typeof createService>['client']): readonly object[] {
  const call = client.appointment.findMany.mock.calls[0]?.[0] as
    { readonly where: { readonly AND: readonly object[] } } | undefined;
  if (!call) throw new Error('Appointment query was not called');
  return call.where.AND;
}

describe('AppointmentQueryService', () => {
  it('scopes hosts to themselves and displays elapsed booked appointments as completed', async () => {
    const { client, service } = createService();

    await expect(service.list(context, input, now)).resolves.toMatchObject({
      items: [
        {
          artistNickname: '柔柔',
          hostCode: 'ZB01001',
          status: 'COMPLETED',
        },
      ],
      page: 1,
      pageSize: 50,
      total: 1,
    });
    expect(whereParts(client)).toContainEqual({ host: { userId: 'host-user-1' } });
  });

  it('scopes artists and customer service without accepting a client site filter', async () => {
    const artist = createService();
    await artist.service.list(
      { ...context, roleCode: 'ARTIST', userId: 'artist-user-1' },
      input,
      now,
    );
    expect(whereParts(artist.client)).toContainEqual({ artist: { userId: 'artist-user-1' } });

    const customerService = createService();
    await customerService.service.list(
      { ...context, roleCode: 'CUSTOMER_SERVICE', siteId: 'site-1' },
      input,
      now,
    );
    expect(whereParts(customerService.client)).toContainEqual({ siteId: 'site-1' });
    await expect(
      customerService.service.list(
        { ...context, roleCode: 'CUSTOMER_SERVICE', siteId: null },
        input,
        now,
      ),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it('builds target-date ranges from the current operator relations', async () => {
    const { client, service } = createService({
      relations: [
        {
          hostId: 'host-1',
          validFrom: new Date('2026-07-24T00:00:00.000Z'),
          validUntil: new Date('2026-07-27T00:00:00.000Z'),
        },
      ],
    });

    await service.list({ ...context, roleCode: 'OPERATOR', userId: 'operator-user-1' }, input, now);

    expect(client.hostOperatorRelation.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        host: { siteId: 'site-1' },
        operator: {
          employmentStatus: 'ACTIVE',
          siteId: 'site-1',
          userId: 'operator-user-1',
        },
      },
    });
    expect(whereParts(client)).toContainEqual({
      OR: [
        {
          appointmentDate: {
            gte: new Date('2026-07-24T00:00:00.000Z'),
            lte: new Date('2026-07-26T00:00:00.000Z'),
          },
          hostId: 'host-1',
        },
      ],
    });
  });

  it('narrows an operator query to one host without replacing relation scope', async () => {
    const { client, service } = createService({
      relations: [
        {
          hostId: 'host-1',
          validFrom: input.fromDate,
          validUntil: null,
        },
      ],
    });

    await service.list(
      { ...context, roleCode: 'OPERATOR', userId: 'operator-user-1' },
      { ...input, hostId: 'host-1' },
      now,
    );

    expect(whereParts(client)).toContainEqual({ hostId: 'host-1' });
    expect(whereParts(client)).toContainEqual({
      OR: [
        {
          appointmentDate: { gte: input.fromDate, lte: input.toDate },
          hostId: 'host-1',
        },
      ],
    });
  });

  it('rejects an operator session without a site scope', async () => {
    const { service } = createService();
    await expect(
      service.list({ ...context, roleCode: 'OPERATOR', siteId: null }, input, now),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it('uses effective time when filtering booked and completed views', async () => {
    const booked = createService();
    await booked.service.list(context, { ...input, status: 'BOOKED' }, now);
    expect(whereParts(booked.client)).toContainEqual({ endAt: { gt: now }, status: 'BOOKED' });

    const completed = createService();
    await completed.service.list(context, { ...input, status: 'COMPLETED' }, now);
    expect(whereParts(completed.client)).toContainEqual({
      OR: [{ status: 'COMPLETED' }, { endAt: { lte: now }, status: 'BOOKED' }],
    });
  });

  it('returns generated fixed appointments with their fixed origin', async () => {
    const { service } = createService({
      appointment: { ...appointment, appointmentType: 'FIXED', id: 'fixed-appointment-1' },
    });

    await expect(service.list(context, input, now)).resolves.toMatchObject({
      items: [{ appointmentType: 'FIXED', id: 'fixed-appointment-1' }],
    });
  });
});
