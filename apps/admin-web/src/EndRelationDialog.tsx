import type { FormEvent } from 'react';

import type { RelationSummary } from './master-data-api';

interface EndRelationDialogProps {
  readonly busy: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (validUntil: string, reason: string) => Promise<void>;
  readonly relation: RelationSummary;
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function EndRelationDialog({
  busy,
  error,
  onClose,
  onSubmit,
  relation,
}: EndRelationDialogProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = form.get('validUntil');
    const reason = form.get('reason');
    void onSubmit(
      typeof date === 'string' ? date : '',
      typeof reason === 'string' ? reason.trim() : '',
    );
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="end-relation-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
      >
        <div className="dialog-header">
          <h2 id="end-relation-title">结束负责关系</h2>
          <button
            aria-label="关闭"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <p className="dialog-note">
          {relation.hostName}｜{relation.hostCode} → {relation.operatorName}
        </p>
        <form className="record-form" onSubmit={submit}>
          <label htmlFor="end-relation-date">结束日期</label>
          <input
            defaultValue={relation.validUntil ?? ''}
            id="end-relation-date"
            min={nextDate(relation.validFrom)}
            name="validUntil"
            required
            type="date"
          />
          <label htmlFor="end-relation-reason">结束原因</label>
          <textarea id="end-relation-reason" maxLength={500} name="reason" required rows={3} />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
              取消
            </button>
            <button className="danger-button" disabled={busy} type="submit">
              {busy ? '正在保存…' : '确认结束'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
