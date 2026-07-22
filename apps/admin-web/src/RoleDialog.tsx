import { type FormEvent, useMemo, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import {
  type AccountSummary,
  assignBackofficeRole,
  type BackofficeRoleSummary,
  revokeBackofficeRole,
  type SiteSummary,
} from './master-data-api';

interface RoleDialogProps {
  readonly account: AccountSummary;
  readonly onChanged: () => void;
  readonly onClose: () => void;
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
  readonly sites: readonly SiteSummary[];
}

function roleName(role: BackofficeRoleSummary, siteNames: ReadonlyMap<string, string>): string {
  if (role.roleCode === 'ADMIN') {
    return '管理员';
  }
  return `客服 · ${role.siteId ? (siteNames.get(role.siteId) ?? '未知场地') : '未指定场地'}`;
}

export function RoleDialog({
  account,
  onChanged,
  onClose,
  onUnauthorized,
  session,
  sites,
}: RoleDialogProps) {
  const [roleCode, setRoleCode] = useState<'ADMIN' | 'CUSTOMER_SERVICE'>('CUSTOMER_SERVICE');
  const [revokeTarget, setRevokeTarget] = useState<BackofficeRoleSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const siteNames = useMemo(() => new Map(sites.map((site) => [site.id, site.name])), [sites]);

  function handleError(cause: unknown, fallback: string) {
    if (cause instanceof ApiError && cause.status === 401) {
      onUnauthorized();
      return;
    }
    setError(cause instanceof ApiError ? cause.message : fallback);
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const siteId = form.get('siteId');
    setBusy(true);
    setError(null);
    try {
      await assignBackofficeRole(session.accessToken, account.id, {
        roleCode,
        ...(roleCode === 'CUSTOMER_SERVICE' && typeof siteId === 'string' ? { siteId } : {}),
      });
      onChanged();
    } catch (cause) {
      handleError(cause, '角色添加失败');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revokeTarget) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const reason = form.get('reason');
    setBusy(true);
    setError(null);
    try {
      await revokeBackofficeRole(
        session.accessToken,
        revokeTarget.id,
        revokeTarget.rowVersion,
        typeof reason === 'string' ? reason.trim() : '',
      );
      onChanged();
    } catch (cause) {
      handleError(cause, '角色撤销失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="role-dialog-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
      >
        <div className="dialog-header">
          <div>
            <h2 id="role-dialog-title">维护账号角色</h2>
            <p className="dialog-subtitle">{account.displayName}</p>
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

        <div className="role-management-list">
          {account.roles.length === 0 ? <p className="dialog-note">当前没有有效角色</p> : null}
          {account.roles.map((role) => (
            <div className="role-management-item" key={role.id}>
              <span>{roleName(role, siteNames)}</span>
              <button disabled={busy} onClick={() => setRevokeTarget(role)} type="button">
                撤销
              </button>
            </div>
          ))}
        </div>

        {revokeTarget ? (
          <form className="record-form separated-form" onSubmit={(event) => void revoke(event)}>
            <strong>撤销“{roleName(revokeTarget, siteNames)}”</strong>
            <label htmlFor="revoke-role-reason">撤销原因</label>
            <textarea id="revoke-role-reason" maxLength={500} name="reason" required rows={3} />
            <div className="dialog-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => setRevokeTarget(null)}
                type="button"
              >
                返回
              </button>
              <button className="danger-button" disabled={busy} type="submit">
                {busy ? '正在撤销…' : '确认撤销'}
              </button>
            </div>
          </form>
        ) : (
          <form className="record-form separated-form" onSubmit={(event) => void assign(event)}>
            <strong>添加角色</strong>
            <label htmlFor="assign-role-code">角色</label>
            <select
              id="assign-role-code"
              name="roleCode"
              onChange={(event) => setRoleCode(event.target.value as typeof roleCode)}
              value={roleCode}
            >
              <option value="CUSTOMER_SERVICE">客服</option>
              <option value="ADMIN">管理员</option>
            </select>
            {roleCode === 'CUSTOMER_SERVICE' ? (
              <>
                <label htmlFor="assign-role-site">负责场地</label>
                <select id="assign-role-site" name="siteId" required>
                  <option value="">请选择场地</option>
                  {sites
                    .filter((site) => site.status === 'ACTIVE')
                    .map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                </select>
              </>
            ) : null}
            <div className="dialog-actions">
              <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
                取消
              </button>
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? '正在添加…' : '添加角色'}
              </button>
            </div>
          </form>
        )}
        {error ? <p className="form-error">{error}</p> : null}
      </section>
    </div>
  );
}
