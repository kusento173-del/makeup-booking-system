import { useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { currentBusinessDate } from './business-date';
import {
  listNotificationTasks,
  type NotificationTask,
  type NotificationTaskFilters,
  type NotificationTaskPage as TaskPage,
  type NotificationTaskStatus,
  retryNotificationTask,
} from './notification-task-api';
import type { NotificationRecipientRole } from './notification-template-api';

interface NotificationTaskPageProps {
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

const ROLE_LABELS: Record<NotificationRecipientRole, string> = {
  ARTIST: '化妆师',
  HOST: '主播',
  OPERATOR: '运营',
};
const PURPOSE_LABELS = {
  APPOINTMENT_NOTICE: '预约即时通知',
  APPOINTMENT_REMINDER: '开始前一小时提醒',
  DAILY_SCHEDULE_SUMMARY: '每日排班汇总',
} as const;
const STATUS_LABELS = {
  CANCELLED: '已取消',
  FAILED: '失败',
  PENDING: '待发送',
  PROCESSING: '发送中',
  RETRY_WAIT: '等待重试',
  SUCCEEDED: '已送达',
} as const;
const EMPTY_PAGE: TaskPage = { items: [], page: 1, pageSize: 50, total: 0 };

function instantLabel(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

export function NotificationTaskPage({ onUnauthorized, session }: NotificationTaskPageProps) {
  const [date, setDate] = useState(currentBusinessDate());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [filters, setFilters] = useState<NotificationTaskFilters>({
    date: currentBusinessDate(),
    page: 1,
  });
  const [result, setResult] = useState<TaskPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [retryTask, setRetryTask] = useState<NotificationTask | null>(null);
  const [retryReason, setRetryReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listNotificationTasks(session.accessToken, filters)
      .then((page) => {
        if (!active) return;
        setResult(page);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
          return;
        }
        setError(errorMessage(cause, '通知任务加载失败，请稍后重试'));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [filters, onUnauthorized, reloadVersion, session.accessToken]);

  function applyFilters(): void {
    setFilters({
      ...(date ? { date } : {}),
      page: 1,
      ...(role ? { recipientRoleCode: role as NotificationRecipientRole } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(status ? { status: status as NotificationTaskStatus } : {}),
    });
  }

  async function handleRetry(): Promise<void> {
    if (!retryTask || !retryReason.trim()) {
      setError('人工重试必须填写原因');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await retryNotificationTask(session.accessToken, retryTask, retryReason.trim());
      setRetryTask(null);
      setRetryReason('');
      setReloadVersion((value) => value + 1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      else setError(errorMessage(cause, '重试任务创建失败，请刷新后重试'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="management-main notification-task-main">
      <header className="management-header">
        <div>
          <p className="eyebrow">投递记录</p>
          <h1>通知任务</h1>
        </div>
        <button
          className="secondary-button"
          disabled={loading}
          onClick={() => setReloadVersion((value) => value + 1)}
          type="button"
        >
          刷新
        </button>
      </header>

      <section className="notification-task-filters" aria-label="通知任务筛选">
        <label>
          <span>计划日期</span>
          <input onChange={(event) => setDate(event.target.value)} type="date" value={date} />
        </label>
        <label>
          <span>状态</span>
          <select onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="">全部状态</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>接收角色</span>
          <select onChange={(event) => setRole(event.target.value)} value={role}>
            <option value="">全部角色</option>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="notification-task-search">
          <span>接收人</span>
          <input
            maxLength={64}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="输入姓名"
            value={search}
          />
        </label>
        <button className="primary-action" onClick={applyFilters} type="button">
          查询
        </button>
      </section>

      {error ? (
        <div className="export-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="table-card" aria-busy={loading}>
        <div className="table-summary">
          <strong>投递记录</strong>
          <span>共 {result.total} 条</span>
        </div>
        {loading && result.items.length === 0 ? (
          <div className="content-message">正在加载…</div>
        ) : null}
        {!loading && result.items.length === 0 ? (
          <div className="content-message">没有符合条件的通知任务</div>
        ) : null}
        {result.items.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>通知内容</th>
                  <th>接收人</th>
                  <th>场地</th>
                  <th>计划时间</th>
                  <th>状态</th>
                  <th>尝试</th>
                  <th>投递结果</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <strong>{PURPOSE_LABELS[task.templateCode]}</strong>
                      <small>{ROLE_LABELS[task.recipientRoleCode]}</small>
                    </td>
                    <td>{task.recipientName}</td>
                    <td>{task.siteName}</td>
                    <td>{instantLabel(task.scheduledAt)}</td>
                    <td>
                      <span className={`task-status ${task.status.toLowerCase()}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                    </td>
                    <td>
                      {task.attemptCount}/{task.maxAttempts}
                    </td>
                    <td className="notification-task-result">
                      {task.status === 'SUCCEEDED'
                        ? `送达 ${instantLabel(task.sentAt)}`
                        : task.status === 'FAILED'
                          ? task.lastErrorSummary || task.lastErrorCode || '发送失败'
                          : task.status === 'CANCELLED'
                            ? `取消 ${instantLabel(task.cancelledAt)}`
                            : '—'}
                    </td>
                    <td>
                      {task.canRetry ? (
                        <button
                          className="table-action"
                          onClick={() => setRetryTask(task)}
                          type="button"
                        >
                          人工重试
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {result.total > result.pageSize ? (
          <div className="pagination">
            <button
              disabled={loading || result.page <= 1}
              onClick={() => setFilters((value) => ({ ...value, page: result.page - 1 }))}
              type="button"
            >
              上一页
            </button>
            <span>第 {result.page} 页</span>
            <button
              disabled={loading || result.page * result.pageSize >= result.total}
              onClick={() => setFilters((value) => ({ ...value, page: result.page + 1 }))}
              type="button"
            >
              下一页
            </button>
          </div>
        ) : null}
      </section>

      {retryTask ? (
        <div className="dialog-backdrop" role="presentation">
          <section aria-modal="true" className="dialog template-action-dialog" role="dialog">
            <div className="dialog-header">
              <div>
                <p className="dialog-subtitle">
                  {retryTask.recipientName} · {PURPOSE_LABELS[retryTask.templateCode]}
                </p>
                <h2>建立人工重试任务</h2>
              </div>
            </div>
            <p className="dialog-note">
              原失败记录保持不变，系统会建立一条新的投递任务。永久性错误不能人工重试。
            </p>
            <label className="compact-field">
              <span>重试原因</span>
              <textarea
                autoFocus
                maxLength={500}
                onChange={(event) => setRetryReason(event.target.value)}
                rows={3}
                value={retryReason}
              />
            </label>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                disabled={saving}
                onClick={() => {
                  setRetryTask(null);
                  setRetryReason('');
                }}
                type="button"
              >
                取消
              </button>
              <button
                className="primary-button"
                disabled={saving}
                onClick={() => void handleRetry()}
                type="button"
              >
                {saving ? '正在创建…' : '确认重试'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
