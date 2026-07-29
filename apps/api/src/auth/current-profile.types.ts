import type { RoleCode } from './authorization.types';

export interface CurrentProfile {
  readonly account: string;
  readonly displayName: string;
  readonly hostCode: string | null;
  readonly personName: string;
  readonly roleCode: RoleCode;
  readonly siteId: string | null;
  readonly siteName: string | null;
}
