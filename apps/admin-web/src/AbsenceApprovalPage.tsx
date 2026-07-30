import { useCallback, useEffect, useState } from 'react';

import {
  listAbsenceApprovals,
  type FullDayLeaveApproval,
  type FullDayLeaveReviewed,
  type PartialLeaveApproval,
  type PartialLeaveReviewed,
  reviewFullDayLeave,
  reviewPartialLeave,
} from './absence-approval-api';
import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import type { AffectedAppointment } from './mobile-api';

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function instantTime(instant: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(instant));
}

function reviewedAtLabel(instant: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(new Date(instant));
}

function requestPeriod(
  kind: 'FULL' | 'PARTIAL',
  request:
    FullDayLeaveApproval | FullDayLeaveReviewed | PartialLeaveApproval | PartialLeaveReviewed,
): string {
  if (kind === 'FULL') {
    const leave = request as FullDayLeaveApproval;
    return `${leave.startDate} 至 ${leave.endDate} · 整日请假`;
  }
  const period = request as PartialLeaveApproval;
  return `${period.unavailableDate} ${minuteLabel(period.startMinute)}–${minuteLabel(period.endMinute)} · 临时不可排班`;
}

const REVIEW_STATUS_LABELS = {
  ACTIVE: '已通过',
  CANCELLED: '已取消请假',
  PENDING: '待审核',
  REJECTED: '已驳回',
} as const;

function ImpactList({ items }: { readonly items: readonly AffectedAppointment[] }) {
  if (items.length === 0) return <p className="mobile-meta">当前没有预约受到影响</p>;
  return (
    <ul className="impact-list">
      {items.map((item) => (
        <li key={item.id}>
          <strong>
            {item.hostName}（{item.hostCode}）
          </strong>
          <span>
            {item.appointmentDate} {instantTime(item.startAt)}–{instantTime(item.endAt)} ·{' '}
            {item.appointmentType === 'FIXED' ? '固定预约' : '单次预约'}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface AbsenceApprovalPageProps {
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

export function AbsenceApprovalPage({ onUnauthorized, session }: AbsenceApprovalPageProps) {
  const [fullDays, setFullDays] = useState<readonly FullDayLeaveApproval[]>([]);
  const [partialDays, setPartialDays] = useState<readonly PartialLeaveApproval[]>([]);
  const [reviewedFullDays, setReviewedFullDays] = useState<readonly FullDayLeaveReviewed[]>([]);
  const [reviewedPartialDays, setReviewedPartialDays] = useState<readonly PartialLeaveReviewed[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAbsenceApprovals(session.accessToken);
      setFullDays(result.fullDays);
      setPartialDays(result.partialDays);
      setReviewedFullDays(result.reviewedFullDays);
      setReviewedPartialDays(result.reviewedPartialDays);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '请假审批列表加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, session.accessToken]);

  useEffect(() => void load(), [load]);

  async function review(
    kind: 'FULL' | 'PARTIAL',
    request: FullDayLeaveApproval | PartialLeaveApproval,
    decision: 'APPROVE' | 'REJECT',
  ) {
    let comment: string | undefined;
    if (decision === 'APPROVE') {
      if (
        !window.confirm(
          `确认通过 ${request.artistNickname} 的请假申请？审批后将取消 ${request.affectedAppointmentCount} 条预约。`,
        )
      )
        return;
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
      if (kind === 'FULL') {
        await reviewFullDayLeave(
          session.accessToken,
          request as FullDayLeaveApproval,
          decision,
          comment,
        );
      } else {
        await reviewPartialLeave(
          session.accessToken,
          request as PartialLeaveApproval,
          decision,
          comment,
        );
      }
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '请假审核失败，请刷新后重试');
    } finally {
      setBusyId(null);
    }
  }

  const total = fullDays.length + partialDays.length;
  const reviewed = [
    ...reviewedFullDays.map((item) => ({ item, kind: 'FULL' as const })),
    ...reviewedPartialDays.map((item) => ({ item, kind: 'PARTIAL' as const })),
  ].sort((left, right) => right.item.reviewedAt.localeCompare(left.item.reviewedAt));
  return (
    <main className="management-main">
      <header className="management-header">
        <div>
          <p className="eyebrow">审批中心</p>
          <h1>化妆师请假审批</h1>
        </div>
        <button className="secondary-button" disabled={loading} onClick={() => void load()}>
          刷新
        </button>
      </header>
      <section className="table-card">
        <div className="table-summary">
          <span>待审核 {total} 条</span>
          <span>通过后，受影响的固定和单次预约将统一标记为“化妆师请假”</span>
        </div>
        {error ? <div className="content-message error-message">{error}</div> : null}
        {loading ? <div className="content-message">正在加载请假申请…</div> : null}
        {!loading && total === 0 ? (
          <div className="content-message">当前没有待审核的化妆师请假</div>
        ) : null}
        {[
          ...fullDays.map((item) => ({ item, kind: 'FULL' as const })),
          ...partialDays.map((item) => ({ item, kind: 'PARTIAL' as const })),
        ].map(({ item, kind }) => (
          <article className="approval-card" key={`${kind}-${item.id}`}>
            <div className="approval-card-header">
              <div>
                <strong>{item.artistNickname}</strong>
                <span>{requestPeriod(kind, item)}</span>
              </div>
              <span>影响 {item.affectedAppointmentCount} 条预约</span>
            </div>
            <p className="mobile-meta">请假原因：{item.reason || '未填写'}</p>
            <ImpactList items={item.affectedAppointments} />
            <div className="row-actions">
              <button
                className="table-action"
                disabled={busyId !== null}
                onClick={() => void review(kind, item, 'APPROVE')}
              >
                {busyId === item.id ? '处理中…' : '通过'}
              </button>
              <button
                className="table-action danger-text"
                disabled={busyId !== null}
                onClick={() => void review(kind, item, 'REJECT')}
              >
                驳回
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="table-card absence-history">
        <div className="table-summary">
          <span>审批记录 {reviewed.length} 条</span>
          <span>保留审批当时的受影响预约，不随后续恢复或取消变化</span>
        </div>
        {!loading && reviewed.length === 0 ? (
          <div className="content-message">当前没有已审核的化妆师请假</div>
        ) : null}
        {reviewed.map(({ item, kind }) => (
          <article className="approval-card" key={`reviewed-${kind}-${item.id}`}>
            <div className="approval-card-header">
              <div>
                <strong>{item.artistNickname}</strong>
                <span>{requestPeriod(kind, item)}</span>
              </div>
              <span>{REVIEW_STATUS_LABELS[item.status]}</span>
            </div>
            <p className="mobile-meta">
              审核时间：{reviewedAtLabel(item.reviewedAt)} · 影响 {item.affectedAppointmentCount}{' '}
              条预约
            </p>
            <p className="mobile-meta">请假原因：{item.reason || '未填写'}</p>
            {item.reviewComment ? (
              <p className="mobile-meta">审核说明：{item.reviewComment}</p>
            ) : null}
            <ImpactList items={item.affectedAppointments} />
          </article>
        ))}
      </section>
    </main>
  );
}
