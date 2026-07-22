import { describe, expect, it } from 'vitest';

import {
  assertNoMasterDataQuery,
  MasterDataRequestInvalidError,
  parseAssignOperatorRequest,
  parseCreateHostRequest,
  parseCreateSiteRequest,
  parseEndOperatorAssignmentRequest,
  parseMasterDataListRequest,
  parseUpdateHostRequest,
  parseUpdateSiteRequest,
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

  it('strictly parses normalized create requests', () => {
    expect(parseCreateSiteRequest({ code: ' sj-2 ', name: ' 新场地 ', sortOrder: 4 })).toEqual({
      code: 'sj-2',
      name: '新场地',
      sortOrder: 4,
      timezone: 'Asia/Shanghai',
    });
    expect(
      parseCreateHostRequest({
        hostCode: ' zb0001 ',
        nickname: null,
        realName: ' 主播一 ',
        siteId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
      }),
    ).toEqual({
      hostCode: 'ZB0001',
      realName: '主播一',
      siteId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
    });
  });

  it('validates relation dates, UUIDs and exact fields', () => {
    expect(
      parseAssignOperatorRequest({
        changeReason: ' 分配运营 ',
        hostId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
        operatorId: '019f7a17-6845-7a90-94cb-e5f5caabd5f7',
        validFrom: '2026-07-23',
      }),
    ).toEqual({
      changeReason: '分配运营',
      hostId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
      operatorId: '019f7a17-6845-7a90-94cb-e5f5caabd5f7',
      validFrom: new Date('2026-07-23T00:00:00.000Z'),
    });
    expect(() =>
      parseAssignOperatorRequest({
        hostId: 'not-a-uuid',
        operatorId: '019f7a17-6845-7a90-94cb-e5f5caabd5f7',
        validFrom: '2026-07-23',
      }),
    ).toThrow(MasterDataRequestInvalidError);
    expect(() =>
      parseCreateSiteRequest({ code: 'BAD', name: '错误', timezone: 'Mars/Base' }),
    ).toThrow(MasterDataRequestInvalidError);
    expect(() =>
      parseAssignOperatorRequest({
        hostId: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
        operatorId: '019f7a17-6845-7a90-94cb-e5f5caabd5f7',
        validFrom: '2026-07-23',
        validUntil: '2026-07-23',
      }),
    ).toThrow(MasterDataRequestInvalidError);
  });

  it('strictly parses optimistic-concurrency update requests', () => {
    expect(
      parseUpdateHostRequest('019F7A17-6845-7A90-94CB-E5F5CAABD5F6', {
        expectedRowVersion: 3,
        nickname: null,
        qualificationStatus: 'SUSPENDED',
        realName: ' 主播一 ',
        reason: ' 暂停资格 ',
        siteId: '019f7a17-6845-7a90-94cb-e5f5caabd5f7',
      }),
    ).toEqual({
      expectedRowVersion: 3,
      id: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
      qualificationStatus: 'SUSPENDED',
      realName: '主播一',
      reason: '暂停资格',
      siteId: '019f7a17-6845-7a90-94cb-e5f5caabd5f7',
    });
    expect(
      parseEndOperatorAssignmentRequest('019f7a17-6845-7a90-94cb-e5f5caabd5f6', {
        expectedRowVersion: 2,
        reason: ' 重新分配 ',
        validUntil: '2026-08-01',
      }),
    ).toEqual({
      expectedRowVersion: 2,
      id: '019f7a17-6845-7a90-94cb-e5f5caabd5f6',
      reason: '重新分配',
      validUntil: new Date('2026-08-01T00:00:00.000Z'),
    });
  });

  it('rejects stale or malformed update input before calling a service', () => {
    const validSiteUpdate = {
      expectedRowVersion: 1,
      name: '松江场地',
      reason: '调整资料',
      sortOrder: 1,
      status: 'ACTIVE',
      timezone: 'Asia/Shanghai',
    };

    expect(() => parseUpdateSiteRequest('not-a-uuid', validSiteUpdate)).toThrow(
      MasterDataRequestInvalidError,
    );
    expect(() =>
      parseUpdateSiteRequest('019f7a17-6845-7a90-94cb-e5f5caabd5f6', {
        ...validSiteUpdate,
        expectedRowVersion: 0,
      }),
    ).toThrow(MasterDataRequestInvalidError);
    expect(() =>
      parseUpdateSiteRequest('019f7a17-6845-7a90-94cb-e5f5caabd5f6', {
        ...validSiteUpdate,
        actorName: '伪造操作人',
      }),
    ).toThrow(MasterDataRequestInvalidError);
  });
});
