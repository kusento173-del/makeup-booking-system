import { useCallback, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { listPendingOvertimes, type OvertimeRequest, reviewOvertime } from './overtime-api';

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(
    2,
    '0',
  )}`;
}

function timeLabel(request: OvertimeRequest): string {
  const work = `${minuteLabel(request.workStartMinute)}–${minuteLabel(request.workEndMinute)}`;
  if (request.breakStartMinute === null || request.breakEndMinute === null) return work;
  return `${work}，午休 ${minuteLabel(request.breakStartMinute)}–${minuteLabel(
    request.breakEndMinute,
  )}`;
}

function submittedLabel(instant: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(instant));
}

interface OvertimeApprovalPageProps {
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

export function OvertimeApprovalPage({ onUnauthorized, session }: OvertimeApprovalPageProps) {
  const [items, setItems] = useState<readonly OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await listPendingOvertimes(session.accessToken);
      setItems(page.items);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '加班审批列表加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, session.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(request: OvertimeRequest, decision: 'APPROVE' | 'REJECT'): Promise<void> {
    let comment: string | undefined;
    if (decision === 'APPROVE') {
      if (!window.confirm(`确认通过 ${request.artistNickname} 的加班申请？`)) return;
    } else {
      const input = window.prompt('请输入驳回原因');
      if (input === null) return;
      comment = input.trim();
      if (!comment) {
        setError('驳回时必须填写原因');
        return;
      }
    }

    setBusyId(request.id);
    setError(null);
    try {
      await reviewOvertime(session.accessToken, request, decision, comment);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '加班审核失败，请稍后重试');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="management-main">
      <header className="management-header">
        <div>
          <p className="eyebrow">审批中心</p>
          <h1>加班申请</h1>
        </div>
        <button className="secondary-button" disabled={loading} onClick={() => void load()}>
          刷新
        </button>
      </header>

      <section className="table-card">
        <div className="table-summary">
          <span>待审核 {items.length} 条</span>
          <span>通过后只开放申请日期，不修改固定班次</span>
        </div>
        {error ? <div className="content-message error-message">{error}</div> : null}
        {loading ? (
          <div className="content-message">正在加载加班申请…</div>
        ) : items.length === 0 ? (
          <div className="content-message">当前没有待审核的加班申请</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>化妆师</th>
                  <th>加班日期</th>
                  <th>加班时间</th>
                  <th>申请原因</th>
                  <th>提交时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <strong>{request.artistNickname}</strong>
                    </td>
                    <td>{request.overtimeDate}</td>
                    <td>{timeLabel(request)}</td>
                    <td>{request.reason}</td>
                    <td>{submittedLabel(request.submittedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="table-action"
                          disabled={busyId !== null}
                          onClick={() => void review(request, 'APPROVE')}
                          type="button"
                        >
                          {busyId === request.id ? '处理中…' : '通过'}
                        </button>
                        <button
                          className="table-action danger-text"
                          disabled={busyId !== null}
                          onClick={() => void review(request, 'REJECT')}
                          type="button"
                        >
                          驳回
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
