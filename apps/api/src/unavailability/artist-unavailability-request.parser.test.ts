import { describe, expect, it } from 'vitest';

import {
  ArtistUnavailabilityRequestInvalidError,
  parseArtistUnavailablePeriodPreviewRequest,
  parseCancelArtistUnavailablePeriodRequest,
  parseCreateArtistUnavailablePeriodRequest,
} from './artist-unavailability-request.parser';

const artistId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';
const periodId = '019f7a17-6845-7a90-94cb-e5f5caabd5f7';

describe('artist unavailability request parser', () => {
  it('parses a strict 15-minute preview range', () => {
    expect(
      parseArtistUnavailablePeriodPreviewRequest({
        artistId: artistId.toUpperCase(),
        endMinute: 900,
        startMinute: 840,
        unavailableDate: '2026-07-25',
      }),
    ).toEqual({
      artistId,
      endMinute: 900,
      startMinute: 840,
      unavailableDate: new Date('2026-07-25T00:00:00.000Z'),
    });
  });

  it('normalizes create and cancel reasons', () => {
    expect(
      parseCreateArtistUnavailablePeriodRequest({
        confirmedAffectedAppointmentCount: 1,
        endMinute: 900,
        reason: ' 上课 ',
        startMinute: 840,
        unavailableDate: '2026-07-25',
      }),
    ).toMatchObject({
      confirmedAffectedAppointmentCount: 1,
      reason: '上课',
    });
    expect(
      parseCancelArtistUnavailablePeriodRequest(periodId, {
        expectedRowVersion: 2,
        reason: ' 恢复可排班 ',
      }),
    ).toEqual({
      expectedRowVersion: 2,
      periodId,
      reason: '恢复可排班',
    });
  });

  it.each([
    { endMinute: 900, extra: true, startMinute: 840, unavailableDate: '2026-07-25' },
    { endMinute: 900, startMinute: 841, unavailableDate: '2026-07-25' },
    { endMinute: 840, startMinute: 840, unavailableDate: '2026-07-25' },
    { endMinute: 900, startMinute: 840, unavailableDate: '2026-02-30' },
  ])('rejects malformed preview input', (body) => {
    expect(() => parseArtistUnavailablePeriodPreviewRequest(body)).toThrow(
      ArtistUnavailabilityRequestInvalidError,
    );
  });
});
