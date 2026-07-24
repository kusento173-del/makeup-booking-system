import { useCallback, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { listPendingShiftChanges, reviewShiftChange, type ShiftChange } from './shift-change-api';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(
    2,
    '0',
  )}`;
}

function shiftLabel(change: ShiftChange): string {
  const work = `${minuteLabel(change.workStartMinute)}–${minuteLabel(change.workEndMinute)}`;
  if (change.breakStartMinute === null || change.breakEndMinute === null) return work;
  return `${work}，午休 ${minuteLabel(change.breakStartMinute)}–${minuteLabel(
    change.breakEndMinute,
  )}`;
}

function workdayLabel(workdays: readonly number[]): string {
  return workdays
    .map((day) => WEEKDAYS[day - 1])
    .filter(Boolean)
    .join('、');
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

interface ShiftApprovalPageProps {
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

export function ShiftApprovalPage({ onUnauthorized, session }: ShiftApprovalPageProps) {
  const [items, setItems] = useState<readonly ShiftChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await listPendingShiftChanges(session.accessToken);
      setItems(page.items);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '审批列表加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, session.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(change: ShiftChange, decision: 'APPROVE' | 'REJECT'): Promise<void> {
    let comment: string | undefined;
    if (decision === 'APPROVE') {
      if (!window.confirm(`确认通过 ${change.artistNickname} 的班次修改？`)) return;
    } else {
      const input = window.prompt('请输入驳回原因');
      if (input === null) return;
      comment = input.trim();
      if (!comment) {
        setError('驳回时必须填写原因');
        return;
      }
    }

    setBusyId(change.id);
    setError(null);
    try {
      await reviewShiftChange(session.accessToken, change, decision, comment);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '审核失败，请稍后重试');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="management-main">
      <header className="management-header">
        <div>
          <p className="eyebrow">审批中心</p>
          <h1>班次修改</h1>
        </div>
        <button className="secondary-button" disabled={loading} onClick={() => void load()}>
          刷新
        </button>
      </header>

      <section className="table-card">
        <div className="table-summary">
          <span>待审核 {items.length} 条</span>
          <span>审批通过后按申请日期产生新班次版本</span>
        </div>
        {error ? <div className="content-message error-message">{error}</div> : null}
        {loading ? (
          <div className="content-message">正在加载班次修改申请…</div>
        ) : items.length === 0 ? (
          <div className="content-message">当前没有待审核的班次修改</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>化妆师</th>
                  <th>申请班次</th>
                  <th>生效日期</th>
                  <th>修改原因</th>
                  <th>提交时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((change) => (
                  <tr key={change.id}>
                    <td>
                      <strong>{change.artistNickname}</strong>
                    </td>
                    <td>
                      <div>{workdayLabel(change.workdays)}</div>
                      <div className="muted-text">{shiftLabel(change)}</div>
                    </td>
                    <td>{change.effectiveFrom}</td>
                    <td>{change.reason}</td>
                    <td>{submittedLabel(change.submittedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="table-action"
                          disabled={busyId !== null}
                          onClick={() => void review(change, 'APPROVE')}
                          type="button"
                        >
                          {busyId === change.id ? '处理中…' : '通过'}
                        </button>
                        <button
                          className="table-action danger-text"
                          disabled={busyId !== null}
                          onClick={() => void review(change, 'REJECT')}
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
