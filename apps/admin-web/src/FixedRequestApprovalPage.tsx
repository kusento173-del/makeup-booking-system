import { useCallback, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import {
  type FixedRequest,
  listPendingFixedRequests,
  reviewFixedRequest,
} from './fixed-request-api';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(
    2,
    '0',
  )}`;
}

function weekdayLabel(weekdays: readonly number[]): string {
  return weekdays
    .map((weekday) => WEEKDAYS[weekday - 1])
    .filter(Boolean)
    .join('、');
}

function requestTypeLabel(request: FixedRequest): string {
  return { CANCEL: '取消固定', CHANGE: '变更固定', CREATE: '申请固定' }[request.requestType];
}

function targetLabel(request: FixedRequest): string {
  if (
    request.targetArtistNickname === null ||
    request.targetStartMinute === null ||
    request.targetDurationMinutes === null
  ) {
    return '结束现有固定关系';
  }
  const endMinute = request.targetStartMinute + request.targetDurationMinutes;
  return `${request.targetArtistNickname} · ${weekdayLabel(request.targetWeekdays)} · ${minuteLabel(
    request.targetStartMinute,
  )}–${minuteLabel(endMinute)} · ${request.targetDurationMinutes}分钟`;
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

interface FixedRequestApprovalPageProps {
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

export function FixedRequestApprovalPage({
  onUnauthorized,
  session,
}: FixedRequestApprovalPageProps) {
  const [items, setItems] = useState<readonly FixedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await listPendingFixedRequests(session.accessToken);
      setItems(page.items);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '固定申请加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, session.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(request: FixedRequest, decision: 'APPROVE' | 'REJECT'): Promise<void> {
    let comment: string | undefined;
    if (decision === 'APPROVE') {
      if (
        !window.confirm(
          `确认通过 ${request.hostName}（${request.hostCode}）的${requestTypeLabel(request)}？`,
        )
      ) {
        return;
      }
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
      await reviewFixedRequest(session.accessToken, request, decision, comment);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(
        cause instanceof ApiError
          ? cause.code === 'FIXED_REQUEST_STATE_CONFLICT'
            ? '申请或固定关系已发生变化，请刷新后重试'
            : cause.message
          : '审核失败，请稍后重试',
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="management-main">
      <header className="management-header">
        <div>
          <p className="eyebrow">审批中心</p>
          <h1>固定申请</h1>
        </div>
        <button className="secondary-button" disabled={loading} onClick={() => void load()}>
          刷新
        </button>
      </header>

      <section className="table-card">
        <div className="table-summary">
          <span>待审核 {items.length} 条</span>
          <span>客服仅能审核所属场地，管理员可审核全部场地</span>
        </div>
        {error ? <div className="content-message error-message">{error}</div> : null}
        {loading ? (
          <div className="content-message">正在加载固定申请…</div>
        ) : items.length === 0 ? (
          <div className="content-message">当前没有待审核的固定申请</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>主播</th>
                  <th>申请</th>
                  <th>目标安排</th>
                  <th>生效日期</th>
                  <th>原因</th>
                  <th>提交人</th>
                  <th>提交时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <strong>{request.hostName}</strong>
                      <div className="muted-text">
                        {request.hostCode} · {request.siteName}
                      </div>
                    </td>
                    <td>{requestTypeLabel(request)}</td>
                    <td>{targetLabel(request)}</td>
                    <td>{request.effectiveFrom}</td>
                    <td>{request.reason}</td>
                    <td>{request.submittedByOperatorName}</td>
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
