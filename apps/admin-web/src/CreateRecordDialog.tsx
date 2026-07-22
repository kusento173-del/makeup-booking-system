import { type FormEvent, useState } from 'react';

import type { SessionTokenPair } from './auth-session';
import type { ManagementView, SiteSummary } from './master-data-api';

type CreateView = Exclude<ManagementView, 'relations'>;

interface CreateRecordDialogProps {
  readonly busy: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (body: Record<string, unknown>) => Promise<void>;
  readonly session: SessionTokenPair;
  readonly sites: readonly SiteSummary[];
  readonly view: CreateView;
}

const TITLES: Record<CreateView, string> = {
  accounts: '新增后台账号',
  artists: '新增化妆师',
  hosts: '新增主播',
  operators: '新增运营',
  sites: '新增场地',
};

function value(form: FormData, key: string): string {
  const entry = form.get(key);
  return typeof entry === 'string' ? entry.trim() : '';
}

export function CreateRecordDialog({
  busy,
  error,
  onClose,
  onSubmit,
  session,
  sites,
  view,
}: CreateRecordDialogProps) {
  const [accountRole, setAccountRole] = useState<'ADMIN' | 'CUSTOMER_SERVICE'>('CUSTOMER_SERVICE');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const siteId = value(form, 'siteId') || session.role.siteId || '';
    let body: Record<string, unknown>;

    switch (view) {
      case 'sites':
        body = { code: value(form, 'code'), name: value(form, 'name') };
        break;
      case 'hosts':
        body = {
          hostCode: value(form, 'hostCode'),
          nickname: value(form, 'nickname') || null,
          realName: value(form, 'realName'),
          siteId,
        };
        break;
      case 'artists':
        body = {
          nickname: value(form, 'nickname'),
          realName: value(form, 'realName'),
          siteId,
        };
        break;
      case 'operators':
        body = { realName: value(form, 'realName'), siteId };
        break;
      case 'accounts': {
        const password = form.get('password');
        body = {
          displayName: value(form, 'displayName'),
          loginName: value(form, 'loginName'),
          password: typeof password === 'string' ? password : '',
          roleCode: accountRole,
          ...(accountRole === 'CUSTOMER_SERVICE' ? { siteId } : {}),
        };
        break;
      }
    }
    void onSubmit(body);
  }

  const showSite = view !== 'sites' && (view !== 'accounts' || accountRole === 'CUSTOMER_SERVICE');

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="create-dialog-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
      >
        <div className="dialog-header">
          <h2 id="create-dialog-title">{TITLES[view]}</h2>
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
          {view === 'sites' ? (
            <>
              <label htmlFor="record-code">场地代码</label>
              <input id="record-code" maxLength={32} name="code" required />
              <label htmlFor="record-name">场地名称</label>
              <input id="record-name" maxLength={64} name="name" required />
            </>
          ) : null}

          {view === 'hosts' ? (
            <>
              <label htmlFor="record-host-code">主播编号</label>
              <input id="record-host-code" maxLength={32} name="hostCode" required />
              <label htmlFor="record-real-name">姓名</label>
              <input id="record-real-name" maxLength={64} name="realName" required />
              <label htmlFor="record-nickname">昵称（可不填）</label>
              <input id="record-nickname" maxLength={64} name="nickname" />
            </>
          ) : null}

          {view === 'artists' ? (
            <>
              <label htmlFor="record-nickname">化妆师昵称</label>
              <input id="record-nickname" maxLength={64} name="nickname" required />
              <label htmlFor="record-real-name">姓名</label>
              <input id="record-real-name" maxLength={64} name="realName" required />
            </>
          ) : null}

          {view === 'operators' ? (
            <>
              <label htmlFor="record-real-name">运营姓名</label>
              <input id="record-real-name" maxLength={64} name="realName" required />
            </>
          ) : null}

          {view === 'accounts' ? (
            <>
              <label htmlFor="record-display-name">账号名称</label>
              <input id="record-display-name" maxLength={64} name="displayName" required />
              <label htmlFor="record-login-name">登录名</label>
              <input
                autoComplete="off"
                id="record-login-name"
                maxLength={64}
                name="loginName"
                required
              />
              <label htmlFor="record-password">初始密码（至少 12 位）</label>
              <input
                autoComplete="new-password"
                id="record-password"
                maxLength={128}
                minLength={12}
                name="password"
                required
                type="password"
              />
              <label htmlFor="record-role">角色</label>
              <select
                id="record-role"
                name="roleCode"
                onChange={(event) =>
                  setAccountRole(event.target.value as 'ADMIN' | 'CUSTOMER_SERVICE')
                }
                value={accountRole}
              >
                <option value="CUSTOMER_SERVICE">客服</option>
                <option value="ADMIN">管理员</option>
              </select>
            </>
          ) : null}

          {showSite && session.role.roleCode === 'ADMIN' ? (
            <>
              <label htmlFor="record-site">所属场地</label>
              <select id="record-site" name="siteId" required>
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

          {error ? <p className="form-error">{error}</p> : null}

          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
              取消
            </button>
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? '正在保存…' : '保存'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
