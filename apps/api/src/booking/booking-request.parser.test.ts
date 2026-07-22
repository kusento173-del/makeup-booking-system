import { describe, expect, it } from 'vitest';

import {
  BookingRequestInvalidError,
  parseBookingSlotsRequest,
  parseCancelBookingRequest,
  parseCreateBookingRequest,
} from './booking-request.parser';

const artistId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';
const hostId = '019f7a18-6845-7a90-94cb-e5f5caabd5f6';

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
});
