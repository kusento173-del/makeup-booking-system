import { useEffect, useMemo, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { addBusinessDays, currentBusinessDate } from './business-date';
import {
  createExportJob,
  downloadExportFile,
  listExportJobs,
  type ExportJob,
  type ExportScope,
  type ExportStatus,
} from './export-api';
import { listSites, type SiteSummary } from './master-data-api';

interface ExportPageProps {
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

const STATUS_LABELS: Record<ExportStatus, string> = {
  FAILED: '生成失败',
  PENDING: '等待生成',
  PROCESSING: '正在生成',
  SUCCEEDED: '生成完成',
};

function instantLabel(instant: string | null): string {
  if (!instant) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(instant));
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

export function ExportPage({ onUnauthorized, session }: ExportPageProps) {
  const today = useMemo(() => currentBusinessDate(), []);
  const isAdmin = session.role.roleCode === 'ADMIN';
  const [scheduleDate, setScheduleDate] = useState(addBusinessDays(today, 1));
  const [scope, setScope] = useState<ExportScope>('SINGLE_SITE');
  const [sites, setSites] = useState<readonly SiteSummary[]>([]);
  const [siteId, setSiteId] = useState(session.role.siteId ?? '');
  const [jobs, setJobs] = useState<readonly ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void listSites(session.accessToken)
      .then((result) => {
        if (!active) return;
        setSites(result);
        setSiteId(
          (current) => current || result.find((site) => site.status === 'ACTIVE')?.id || '',
        );
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
          return;
        }
        setError(errorMessage(cause, '场地加载失败，请稍后重试'));
      });
    return () => {
      active = false;
    };
  }, [isAdmin, onUnauthorized, session.accessToken]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listExportJobs(session.accessToken)
      .then((result) => {
        if (!active) return;
        setJobs(result.items);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
          return;
        }
        setError(errorMessage(cause, '导出记录加载失败，请稍后重试'));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [onUnauthorized, reloadVersion, session.accessToken]);

  const hasRunningJob = jobs.some((job) => job.status === 'PENDING' || job.status === 'PROCESSING');
  useEffect(() => {
    if (!hasRunningJob) return;
    const timer = window.setInterval(() => setReloadVersion((value) => value + 1), 5_000);
    return () => window.clearInterval(timer);
  }, [hasRunningJob]);

  async function handleCreate(): Promise<void> {
    if (isAdmin && scope === 'SINGLE_SITE' && !siteId) {
      setError('请选择场地');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createExportJob(
        session.accessToken,
        {
          scheduleDate,
          scope: isAdmin ? scope : 'SINGLE_SITE',
          ...(isAdmin && scope === 'SINGLE_SITE' ? { siteId } : {}),
        },
        crypto.randomUUID(),
      );
      setReloadVersion((value) => value + 1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(errorMessage(cause, '导出任务创建失败，请稍后重试'));
    } finally {
      setCreating(false);
    }
  }

  async function handleDownload(job: ExportJob): Promise<void> {
    setDownloadingId(job.id);
    setError(null);
    try {
      await downloadExportFile(session.accessToken, job);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(errorMessage(cause, '文件下载失败，请稍后重试'));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <main className="management-main export-main">
      <header className="management-header">
        <div>
          <p className="eyebrow">排班管理</p>
          <h1>排班导出</h1>
        </div>
        <button
          className="secondary-button"
          disabled={loading}
          onClick={() => setReloadVersion((value) => value + 1)}
          type="button"
        >
          刷新记录
        </button>
      </header>

      <section className="export-create-card" aria-label="创建排班导出">
        <label className="compact-field">
          <span>排班日期</span>
          <input
            max={addBusinessDays(today, 7)}
            onChange={(event) => setScheduleDate(event.target.value)}
            type="date"
            value={scheduleDate}
          />
        </label>
        {isAdmin ? (
          <>
            <label className="compact-field">
              <span>导出范围</span>
              <select
                onChange={(event) => setScope(event.target.value as ExportScope)}
                value={scope}
              >
                <option value="SINGLE_SITE">单个场地</option>
                <option value="ALL_SITES">全部场地</option>
              </select>
            </label>
            {scope === 'SINGLE_SITE' ? (
              <label className="compact-field">
                <span>场地</span>
                <select onChange={(event) => setSiteId(event.target.value)} value={siteId}>
                  <option value="">请选择</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                      {site.status === 'INACTIVE' ? '（已停用）' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : (
          <div className="export-scope-note">
            <span>导出范围</span>
            <strong>本场地</strong>
          </div>
        )}
        <button
          className="primary-action"
          disabled={creating || !scheduleDate}
          onClick={() => void handleCreate()}
          type="button"
        >
          {creating ? '正在创建…' : '生成 Excel'}
        </button>
      </section>

      {error ? (
        <div className="export-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="table-card" aria-busy={loading}>
        <div className="table-summary">
          <strong>最近导出记录</strong>
          <span>{hasRunningJob ? '任务处理中，每 5 秒自动更新' : `共 ${jobs.length} 条`}</span>
        </div>
        {loading && jobs.length === 0 ? <div className="content-message">正在加载…</div> : null}
        {!loading && jobs.length === 0 ? <div className="content-message">暂无导出记录</div> : null}
        {jobs.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>排班日期</th>
                  <th>范围</th>
                  <th>创建时间</th>
                  <th>状态</th>
                  <th>数据</th>
                  <th>有效期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <strong>{job.scheduleDate}</strong>
                    </td>
                    <td>{job.scope === 'ALL_SITES' ? '全部场地' : (job.siteName ?? '本场地')}</td>
                    <td>{instantLabel(job.createdAt)}</td>
                    <td>
                      <span className={`export-status ${job.status.toLowerCase()}`}>
                        {STATUS_LABELS[job.status]}
                      </span>
                    </td>
                    <td className={job.status === 'FAILED' ? 'export-failure' : undefined}>
                      {job.status === 'FAILED'
                        ? (job.failureReason ?? '生成失败')
                        : job.rowCount === null
                          ? '—'
                          : `${job.rowCount} 行`}
                    </td>
                    <td>{job.expiresAt ? instantLabel(job.expiresAt) : '—'}</td>
                    <td>
                      {job.downloadable ? (
                        <button
                          className="table-action"
                          disabled={downloadingId === job.id}
                          onClick={() => void handleDownload(job)}
                          type="button"
                        >
                          {downloadingId === job.id ? '下载中…' : '下载 Excel'}
                        </button>
                      ) : (
                        <span className="muted-text">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
