import { describe, expect, it } from 'vitest';

import {
  parseAssignBackofficeRoleRequest,
  parseBackofficeAccountListRequest,
  parseCreateBackofficeAccountRequest,
  parseUpdateBackofficeAccountRequest,
} from './backoffice-account-request.parser';
import { MasterDataRequestInvalidError } from './master-data-request.parser';

const id = '019f7a17-6845-7a90-94cb-e5f5caabd5f6';

describe('backoffice account request parser', () => {
  it('accepts all account roles as list filters', () => {
    expect(
      parseBackofficeAccountListRequest({
        page: '2',
        pageSize: '50',
        roleCode: 'ARTIST',
        search: '阿伟',
      }),
    ).toEqual({ page: 2, pageSize: 50, roleCode: 'ARTIST', search: '阿伟' });
    expect(() => parseBackofficeAccountListRequest({ roleCode: 'TEACHER' })).toThrow(
      MasterDataRequestInvalidError,
    );
  });

  it('normalizes a customer-service account without altering its password', () => {
    expect(
      parseCreateBackofficeAccountRequest({
        displayName: ' 松江客服 ',
        loginName: ' Service.SJ ',
        password: 'Correct Horse 123',
        roleCode: 'CUSTOMER_SERVICE',
        siteId: id.toUpperCase(),
      }),
    ).toEqual({
      displayName: '松江客服',
      loginName: 'service.sj',
      password: 'Correct Horse 123',
      roleCode: 'CUSTOMER_SERVICE',
      siteId: id,
    });
  });

  it('requires a site only for customer service and rejects unknown fields', () => {
    expect(() => parseAssignBackofficeRoleRequest(id, { roleCode: 'CUSTOMER_SERVICE' })).toThrow(
      MasterDataRequestInvalidError,
    );
    expect(() => parseAssignBackofficeRoleRequest(id, { roleCode: 'ADMIN', siteId: id })).toThrow(
      MasterDataRequestInvalidError,
    );
    expect(() =>
      parseUpdateBackofficeAccountRequest(id, {
        displayName: '管理员',
        expectedRowVersion: 1,
        reason: '调整',
        status: 'ACTIVE',
        userId: id,
      }),
    ).toThrow(MasterDataRequestInvalidError);
  });
});
