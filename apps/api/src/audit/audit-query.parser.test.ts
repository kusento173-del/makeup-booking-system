import { describe, expect, it } from 'vitest';

import { AuditQueryInvalidError, parseAuditQuery } from './audit-query.parser';

describe('audit query parser', () => {
  it('parses bounded filters', () => {
    expect(
      parseAuditQuery({
        action: 'APPOINTMENT_CREATED',
        objectType: 'APPOINTMENT',
        page: '2',
        pageSize: '100',
        siteId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
      }),
    ).toEqual({
      action: 'APPOINTMENT_CREATED',
      objectType: 'APPOINTMENT',
      page: 2,
      pageSize: 100,
      siteId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
    });
  });

  it('uses safe pagination defaults', () => {
    expect(parseAuditQuery({})).toEqual({ page: 1, pageSize: 50 });
  });

  it.each([{ extra: 'x' }, { pageSize: '101' }, { action: 'invalid-action' }, { siteId: 'x' }])(
    'rejects malformed or unknown input',
    (query) => expect(() => parseAuditQuery(query)).toThrow(AuditQueryInvalidError),
  );
});
