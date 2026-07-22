import type { MasterDataCommandContext } from '../master-data/master-data-command.types';

export type ExportScope = 'ALL_SITES' | 'SINGLE_SITE';
export type ExportStatus = 'FAILED' | 'PENDING' | 'PROCESSING' | 'SUCCEEDED';

export interface CreateExportCommand {
  readonly idempotencyKey: string;
  readonly scheduleDate: Date;
  readonly scope: ExportScope;
  readonly siteId?: string;
}

export interface ExportListInput {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: ExportStatus;
}

export interface ExportSummary {
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly downloadable: boolean;
  readonly expiresAt: string | null;
  readonly failureReason: string | null;
  readonly id: string;
  readonly outputFilename: string | null;
  readonly rowCount: number | null;
  readonly rowVersion: number;
  readonly scheduleDate: string;
  readonly scope: ExportScope;
  readonly siteId: string | null;
  readonly siteName: string | null;
  readonly status: ExportStatus;
}

export interface ExportPage {
  readonly items: readonly ExportSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export type ExportCommandContext = MasterDataCommandContext;
