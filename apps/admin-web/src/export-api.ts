import { ApiError, apiRequest } from './api-client';

export type ExportScope = 'ALL_SITES' | 'SINGLE_SITE';
export type ExportStatus = 'FAILED' | 'PENDING' | 'PROCESSING' | 'SUCCEEDED';

export interface ExportJob {
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

export interface ExportPageResult {
  readonly items: readonly ExportJob[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export function listExportJobs(token: string): Promise<ExportPageResult> {
  return apiRequest('/export-jobs?page=1&pageSize=50', { token });
}

export function createExportJob(
  token: string,
  input: { readonly scheduleDate: string; readonly scope: ExportScope; readonly siteId?: string },
  idempotencyKey: string,
): Promise<ExportJob> {
  return fetch('/api/export-jobs', {
    body: JSON.stringify(input),
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    method: 'POST',
  }).then(async (response) => {
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
      };
      throw new ApiError(
        response.status,
        payload.error?.code ?? 'REQUEST_FAILED',
        payload.error?.message ?? '导出创建失败，请稍后重试',
      );
    }
    return (await response.json()) as ExportJob;
  });
}

export async function downloadExportFile(token: string, job: ExportJob): Promise<void> {
  const response = await fetch(`/api/export-jobs/${job.id}/download`, {
    headers: { Accept: '*/*', Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    throw new ApiError(
      response.status,
      payload.error?.code ?? 'REQUEST_FAILED',
      payload.error?.message ?? '文件下载失败，请稍后重试',
    );
  }
  const url = URL.createObjectURL(await response.blob());
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = job.outputFilename ?? `${job.scheduleDate}_排班.xlsx`;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
