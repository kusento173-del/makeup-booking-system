import { describe, expect, it } from 'vitest';

import {
  assertNoMasterDataQuery,
  MasterDataRequestInvalidError,
  parseMasterDataListRequest,
} from './master-data-request.parser';

describe('master-data request parser', () => {
  it('normalizes bounded pagination, search and a valid business date', () => {
    expect(
      parseMasterDataListRequest(
        { asOf: '2026-07-22', page: '2', pageSize: '20', search: '  ＺＢ01  ' },
        { includeAsOf: true },
      ),
    ).toEqual({
      asOf: new Date('2026-07-22T00:00:00.000Z'),
      page: { page: 2, pageSize: 20, search: 'ZB01' },
    });
  });

  it('uses the Shanghai calendar date when asOf is omitted', () => {
    expect(
      parseMasterDataListRequest({}, { includeAsOf: true, now: new Date('2026-07-21T16:30:00Z') })
        .asOf,
    ).toEqual(new Date('2026-07-22T00:00:00.000Z'));
  });

  it('rejects impossible dates, oversized pages and unknown fields', () => {
    expect(() => parseMasterDataListRequest({ asOf: '2026-02-30' }, { includeAsOf: true })).toThrow(
      MasterDataRequestInvalidError,
    );
    expect(() => parseMasterDataListRequest({ pageSize: '101' })).toThrow(
      MasterDataRequestInvalidError,
    );
    expect(() => parseMasterDataListRequest({ siteId: 'forged-site' })).toThrow(
      MasterDataRequestInvalidError,
    );
    expect(() => assertNoMasterDataQuery({ includeInactive: 'true' })).toThrow(
      MasterDataRequestInvalidError,
    );
  });
});
