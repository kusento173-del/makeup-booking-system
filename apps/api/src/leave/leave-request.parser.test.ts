import { describe, expect, it } from 'vitest';

import {
  LeaveRequestInvalidError,
  parseCancelLeaveRequest,
  parseCreateLeaveRequest,
  parseLeavePreviewRequest,
} from './leave-request.parser';

const leaveId = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';

describe('leave request parser', () => {
  it('parses strict date-only preview input', () => {
    expect(parseLeavePreviewRequest({ endDate: '2026-07-24', startDate: '2026-07-23' })).toEqual({
      endDate: new Date('2026-07-24T00:00:00.000Z'),
      startDate: new Date('2026-07-23T00:00:00.000Z'),
    });
  });

  it('normalizes a create reason and preserves the confirmed impact count', () => {
    expect(
      parseCreateLeaveRequest({
        confirmedAffectedAppointmentCount: 0,
        endDate: '2026-07-24',
        reason: '  主播请假  ',
        startDate: '2026-07-23',
      }),
    ).toEqual({
      confirmedAffectedAppointmentCount: 0,
      endDate: new Date('2026-07-24T00:00:00.000Z'),
      reason: '主播请假',
      startDate: new Date('2026-07-23T00:00:00.000Z'),
    });
  });

  it('parses a strict cancellation command', () => {
    expect(parseCancelLeaveRequest(leaveId.toUpperCase(), { expectedRowVersion: 2 })).toEqual({
      expectedRowVersion: 2,
      leaveId,
    });
  });

  it.each([
    { endDate: '2026-02-30', startDate: '2026-02-28' },
    { endDate: '2026-07-24', extra: true, startDate: '2026-07-23' },
  ])('rejects invalid preview input', (body) => {
    expect(() => parseLeavePreviewRequest(body)).toThrow(LeaveRequestInvalidError);
  });

  it('rejects a malformed leave id or non-positive row version', () => {
    expect(() => parseCancelLeaveRequest('not-a-uuid', { expectedRowVersion: 1 })).toThrow(
      LeaveRequestInvalidError,
    );
    expect(() => parseCancelLeaveRequest(leaveId, { expectedRowVersion: 0 })).toThrow(
      LeaveRequestInvalidError,
    );
  });
});
