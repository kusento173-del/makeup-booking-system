import type { FormEvent } from 'react';

interface DeleteRecordDialogProps {
  readonly busy: boolean;
  readonly error: string | null;
  readonly name: string;
  readonly onClose: () => void;
  readonly onSubmit: (reason: string) => Promise<void>;
  readonly type: '主播' | '化妆师' | '运营' | '客服';
}

export function DeleteRecordDialog({
  busy,
  error,
  name,
  onClose,
  onSubmit,
  type,
}: DeleteRecordDialogProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason');
    void onSubmit(typeof reason === 'string' ? reason.trim() : '');
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="delete-record-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
      >
        <div className="dialog-header">
          <div>
            <h2 id="delete-record-title">删除{type}</h2>
            <p className="dialog-subtitle">{name}</p>
          </div>
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
        <form className="record-form" onSubmit={submit}>
          <p className="dialog-note">
            删除后账号立即失效且不能再参与预约或排班；历史业务和操作记录会保留。
          </p>
          <label htmlFor="delete-record-reason">删除原因</label>
          <textarea id="delete-record-reason" maxLength={500} name="reason" required rows={3} />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
              取消
            </button>
            <button className="danger-button" disabled={busy} type="submit">
              {busy ? '正在删除…' : '确认删除'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
