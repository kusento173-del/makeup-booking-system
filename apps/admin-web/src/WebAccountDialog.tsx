import { type FormEvent, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import {
  type ArtistSummary,
  type HostSummary,
  type OperatorSummary,
  provisionProfileAccount,
  resetWebAccountPassword,
} from './master-data-api';

export type ProfileAccountTarget = HostSummary | ArtistSummary | OperatorSummary;

interface WebAccountDialogProps {
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly session: SessionTokenPair;
  readonly target: ProfileAccountTarget;
  readonly type: 'ARTIST' | 'HOST' | 'OPERATOR';
}

export function WebAccountDialog({
  onClose,
  onSaved,
  session,
  target,
  type,
}: WebAccountDialogProps) {
  const enabled = target.webAccountEnabled;
  const [loginName, setLoginName] = useState(
    type === 'HOST' ? (target as HostSummary).hostCode : '',
  );
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        await resetWebAccountPassword(
          session.accessToken,
          target.id,
          type,
          temporaryPassword,
          reason,
        );
      } else {
        await provisionProfileAccount(session.accessToken, {
          ...(loginName ? { loginName } : {}),
          profileId: target.id,
          roleCode: type,
          temporaryPassword,
        });
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '账号操作失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="web-account-title"
        aria-modal="true"
        className="dialog-card"
        role="dialog"
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">网页账号</p>
            <h2 id="web-account-title">{enabled ? '重置临时密码' : '开通网页账号'}</h2>
          </div>
          <button className="icon-button" disabled={busy} onClick={onClose} type="button">
            关闭
          </button>
        </header>

        <form className="dialog-form" onSubmit={(event) => void submit(event)}>
          {!enabled ? (
            <>
              <label htmlFor="web-login-name">登录名</label>
              <input
                disabled={busy || type === 'HOST'}
                id="web-login-name"
                maxLength={64}
                minLength={3}
                onChange={(event) => setLoginName(event.target.value)}
                required
                value={loginName}
              />
              {type === 'HOST' ? <p className="field-hint">主播登录名固定使用主播编号。</p> : null}
            </>
          ) : (
            <>
              <label htmlFor="password-reset-reason">重置原因</label>
              <input
                disabled={busy}
                id="password-reset-reason"
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                required
                value={reason}
              />
            </>
          )}

          <label htmlFor="temporary-password">临时密码</label>
          <input
            autoComplete="new-password"
            disabled={busy}
            id="temporary-password"
            maxLength={128}
            minLength={12}
            onChange={(event) => setTemporaryPassword(event.target.value)}
            required
            type="password"
            value={temporaryPassword}
          />
          <p className="field-hint">至少 12 位。用户首次登录时必须修改。</p>

          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
              取消
            </button>
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? '正在保存…' : '确认'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
