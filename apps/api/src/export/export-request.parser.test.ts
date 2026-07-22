import { describe, expect, it } from 'vitest';

import { ExportRequestInvalidError } from './export.errors';
import { parseCreateExportRequest, parseExportListRequest } from './export-request.parser';

describe('export request parser', () => {
  it('parses a strict single-site export request', () => {
    expect(
      parseCreateExportRequest(
        {
          scheduleDate: '2026-07-23',
          scope: 'SINGLE_SITE',
          siteId: '019b0000-0000-7000-8000-000000000001',
        },
        'export-key-0001',
      ),
    ).toEqual({
      idempotencyKey: 'export-key-0001',
      scheduleDate: new Date('2026-07-23T00:00:00.000Z'),
      scope: 'SINGLE_SITE',
      siteId: '019b0000-0000-7000-8000-000000000001',
    });
  });

  it('rejects unknown fields and invalid calendar dates', () => {
    expect(() =>
      parseCreateExportRequest(
        { scheduleDate: '2026-02-30', scope: 'ALL_SITES', unexpected: true },
        'export-key-0001',
      ),
    ).toThrow(ExportRequestInvalidError);
  });

  it('bounds list pagination and status', () => {
    expect(parseExportListRequest({ page: '2', pageSize: '100', status: 'SUCCEEDED' })).toEqual({
      page: 2,
      pageSize: 100,
      status: 'SUCCEEDED',
    });
    expect(() => parseExportListRequest({ pageSize: '101' })).toThrow(ExportRequestInvalidError);
  });
});
