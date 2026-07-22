import { describe, expect, it } from 'vitest';

import {
  BookingRequestInvalidError,
  parseAppointmentListRequest,
  parseBookingSlotsRequest,
  parseCancelBookingRequest,
  parseCancelFixedRequest,
  parseChangeFixedRequest,
  parseCreateBookingRequest,
  parseCreateFixedRequest,
  parseFixedAvailabilityRequest,
  parseFixedHostStateRequest,
  parseFixedRequestList,
  parseRescheduleBookingRequest,
  parseReviewFixedRequest,
  parseWithdrawFixedRequest,
} from './booking-request.parser';

const artistId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';
const hostId = '019f7a18-6845-7a90-94cb-e5f5caabd5f6';
const ruleId = '019f7a19-6845-7a90-94cb-e5f5caabd5f6';

describe('booking request parser', () => {
  it('parses strict slot query strings', () => {
    expect(
      parseBookingSlotsRequest({
        artistId: artistId.toUpperCase(),
        date: '2026-07-23',
        durationMinutes: '45',
        hostId,
      }),
    ).toEqual({
      artistId,
      date: new Date('2026-07-23T00:00:00.000Z'),
      durationMinutes: 45,
      hostId,
    });
  });

  it('parses a booking body and defaults the second-booking confirmation to false', () => {
    expect(
      parseCreateBookingRequest(
        { artistId, date: '2026-07-23', durationMinutes: 30, hostId, startMinute: 570 },
        'booking-key-0001',
      ),
    ).toEqual({
      artistId,
      confirmedSecondBooking: false,
      date: new Date('2026-07-23T00:00:00.000Z'),
      durationMinutes: 30,
      hostId,
      idempotencyKey: 'booking-key-0001',
      startMinute: 570,
    });
  });

  it('parses a strict fixed-availability query', () => {
    expect(
      parseFixedAvailabilityRequest({
        artistId,
        durationMinutes: '30',
        hostId,
        requestedStartDate: '2026-07-27',
        weekdays: '1, 3,5',
      }),
    ).toEqual({
      artistId,
      durationMinutes: 30,
      hostId,
      requestedStartDate: new Date('2026-07-27T00:00:00.000Z'),
      weekdays: [1, 3, 5],
    });
    expect(() =>
      parseFixedAvailabilityRequest({
        artistId,
        durationMinutes: '30',
        hostId,
        requestedStartDate: '2026-07-27',
        siteId: 'forged',
        weekdays: '1,3',
      }),
    ).toThrow(BookingRequestInvalidError);
  });

  it('parses a strict fixed-request body without accepting forged scope', () => {
    expect(
      parseCreateFixedRequest(
        {
          artistId,
          durationMinutes: 30,
          effectiveFrom: '2026-07-27',
          hostId,
          reason: '申请固定',
          startMinute: 540,
          weekdays: [1, 3],
        },
        'fixed-key-0001',
      ),
    ).toEqual({
      artistId,
      durationMinutes: 30,
      effectiveFrom: new Date('2026-07-27T00:00:00.000Z'),
      hostId,
      idempotencyKey: 'fixed-key-0001',
      reason: '申请固定',
      startMinute: 540,
      weekdays: [1, 3],
    });
    expect(() =>
      parseCreateFixedRequest(
        {
          artistId,
          durationMinutes: 30,
          effectiveFrom: '2026-07-27',
          hostId,
          reason: '申请固定',
          siteId: 'forged',
          startMinute: 540,
          weekdays: [1, 3],
        },
        'fixed-key-0001',
      ),
    ).toThrow(BookingRequestInvalidError);
  });

  it('parses bounded fixed-request list filters', () => {
    expect(
      parseFixedRequestList({
        page: '2',
        pageSize: '100',
        requestType: 'CHANGE',
        status: 'APPROVED',
      }),
    ).toEqual({ page: 2, pageSize: 100, requestType: 'CHANGE', status: 'APPROVED' });
    expect(() => parseFixedRequestList({ pageSize: '101' })).toThrow(BookingRequestInvalidError);
    expect(() => parseFixedRequestList({ siteId: 'forged' })).toThrow(BookingRequestInvalidError);
  });

  it('parses strict fixed change and cancellation requests', () => {
    expect(
      parseChangeFixedRequest(
        {
          artistId,
          currentRuleId: ruleId,
          durationMinutes: 45,
          effectiveFrom: '2026-07-28',
          hostId,
          reason: '调整固定时间',
          startMinute: 600,
          weekdays: [2, 4],
        },
        'fixed-change-0001',
      ),
    ).toEqual({
      artistId,
      currentRuleId: ruleId,
      durationMinutes: 45,
      effectiveFrom: new Date('2026-07-28T00:00:00.000Z'),
      hostId,
      idempotencyKey: 'fixed-change-0001',
      reason: '调整固定时间',
      startMinute: 600,
      weekdays: [2, 4],
    });
    expect(
      parseCancelFixedRequest(
        {
          currentRuleId: ruleId,
          effectiveFrom: '2026-07-28',
          hostId,
          reason: '取消固定',
        },
        'fixed-cancel-0001',
      ),
    ).toEqual({
      currentRuleId: ruleId,
      effectiveFrom: new Date('2026-07-28T00:00:00.000Z'),
      hostId,
      idempotencyKey: 'fixed-cancel-0001',
      reason: '取消固定',
    });
    expect(() =>
      parseCancelFixedRequest(
        { currentRuleId: ruleId, effectiveFrom: '2026-07-28', hostId, reason: '取消', siteId: 'x' },
        'fixed-cancel-0001',
      ),
    ).toThrow(BookingRequestInvalidError);
  });

  it('parses fixed state identity, change preview and withdrawal concurrency fields', () => {
    expect(parseFixedHostStateRequest(hostId)).toBe(hostId);
    expect(
      parseFixedAvailabilityRequest({
        artistId,
        currentRuleId: ruleId,
        durationMinutes: '30',
        hostId,
        requestedStartDate: '2026-07-27',
        weekdays: '1,3',
      }),
    ).toMatchObject({ currentRuleId: ruleId });
    expect(parseWithdrawFixedRequest(ruleId, { expectedRowVersion: 2 })).toEqual({
      expectedRowVersion: 2,
      requestId: ruleId,
    });
    expect(() =>
      parseWithdrawFixedRequest(ruleId, { expectedRowVersion: 2, status: 'WITHDRAWN' }),
    ).toThrow(BookingRequestInvalidError);
  });

  it('parses strict fixed-request review decisions and concurrency fields', () => {
    expect(
      parseReviewFixedRequest(artistId, {
        comment: '同意固定',
        decision: 'APPROVE',
        expectedRowVersion: 2,
      }),
    ).toEqual({
      comment: '同意固定',
      decision: 'APPROVE',
      expectedRowVersion: 2,
      requestId: artistId,
    });
    expect(() =>
      parseReviewFixedRequest(artistId, { decision: 'DELETE', expectedRowVersion: 2 }),
    ).toThrow(BookingRequestInvalidError);
  });

  it.each([
    [{ artistId, date: '2026-02-30', durationMinutes: '30', hostId }],
    [{ artistId, date: '2026-07-23', durationMinutes: '30', extra: true, hostId }],
    [{ artistId: 'bad-id', date: '2026-07-23', durationMinutes: '30', hostId }],
  ])('rejects malformed and unknown slot query fields', (query) => {
    expect(() => parseBookingSlotsRequest(query)).toThrow(BookingRequestInvalidError);
  });

  it('rejects missing idempotency headers, string body numbers and unknown body fields', () => {
    const body = { artistId, date: '2026-07-23', durationMinutes: 30, hostId, startMinute: 570 };
    expect(() => parseCreateBookingRequest(body, undefined)).toThrow(BookingRequestInvalidError);
    expect(() => parseCreateBookingRequest({ ...body, durationMinutes: '30' }, 'key')).toThrow(
      BookingRequestInvalidError,
    );
    expect(() => parseCreateBookingRequest({ ...body, siteId: 'forged' }, 'key')).toThrow(
      BookingRequestInvalidError,
    );
  });

  it('parses cancellation concurrency fields and rejects forged fields', () => {
    expect(
      parseCancelBookingRequest(artistId, { expectedRowVersion: 2, reason: '临时有事' }),
    ).toEqual({
      appointmentId: artistId,
      expectedRowVersion: 2,
      reason: '临时有事',
    });
    expect(() => parseCancelBookingRequest(artistId, { expectedRowVersion: 0 })).toThrow(
      BookingRequestInvalidError,
    );
    expect(() =>
      parseCancelBookingRequest(artistId, { expectedRowVersion: 1, status: 'CANCELLED' }),
    ).toThrow(BookingRequestInvalidError);
  });

  it('parses rescheduling without accepting a forged host identity', () => {
    expect(
      parseRescheduleBookingRequest(
        hostId,
        {
          artistId,
          confirmedSecondBooking: true,
          date: '2026-07-24',
          durationMinutes: 45,
          expectedRowVersion: 2,
          reason: '改到下午',
          startMinute: 780,
        },
        'reschedule-key-0001',
      ),
    ).toEqual({
      appointmentId: hostId,
      artistId,
      confirmedSecondBooking: true,
      date: new Date('2026-07-24T00:00:00.000Z'),
      durationMinutes: 45,
      expectedRowVersion: 2,
      idempotencyKey: 'reschedule-key-0001',
      reason: '改到下午',
      startMinute: 780,
    });
    expect(() =>
      parseRescheduleBookingRequest(
        hostId,
        {
          artistId,
          date: '2026-07-24',
          durationMinutes: 45,
          expectedRowVersion: 2,
          hostId,
          startMinute: 780,
        },
        'reschedule-key-0001',
      ),
    ).toThrow(BookingRequestInvalidError);
  });

  it('parses bounded appointment date ranges and defaults to the Shanghai business date', () => {
    expect(parseAppointmentListRequest({}, new Date('2026-07-22T16:30:00.000Z'))).toEqual({
      fromDate: new Date('2026-07-23T00:00:00.000Z'),
      page: 1,
      pageSize: 50,
      toDate: new Date('2026-07-23T00:00:00.000Z'),
    });
    expect(
      parseAppointmentListRequest({
        fromDate: '2026-07-01',
        page: '2',
        pageSize: '100',
        status: 'CANCELLED',
        toDate: '2026-07-31',
      }),
    ).toMatchObject({ page: 2, pageSize: 100, status: 'CANCELLED' });
    expect(() =>
      parseAppointmentListRequest({ fromDate: '2026-07-01', toDate: '2026-08-01' }),
    ).toThrow(BookingRequestInvalidError);
  });
});
