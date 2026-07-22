import { BINDABLE_ROLE_CODES, type IssueBindingCodeCommand } from '../auth/binding-code.types';
import { MasterDataRequestInvalidError, parseMasterDataId } from './master-data-request.parser';

export function parseIssueBindingCodeRequest(body: unknown): IssueBindingCodeCommand {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new MasterDataRequestInvalidError();
  }

  const value = body as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => !['profileId', 'roleCode'].includes(key)) ||
    typeof value['roleCode'] !== 'string' ||
    !BINDABLE_ROLE_CODES.includes(value['roleCode'] as (typeof BINDABLE_ROLE_CODES)[number])
  ) {
    throw new MasterDataRequestInvalidError();
  }

  return {
    profileId: parseMasterDataId(value['profileId']),
    roleCode: value['roleCode'] as (typeof BINDABLE_ROLE_CODES)[number],
  };
}
