import { type FormEvent, useState } from 'react';

import type { SessionRole } from './auth-session';

interface LoginPageProps {
  readonly busy: boolean;
  readonly error: string | null;
  readonly pendingRoles: readonly SessionRole[];
  readonly onLogin: (loginName: string, password: string) => Promise<void>;
  readonly onSelectRole: (roleAssignmentId: string) => Promise<void>;
}

const ROLE_NAMES: Record<SessionRole['roleCode'], string> = {
  ADMIN: '管理员',
  CUSTOMER_SERVICE: '客服',
};

export function LoginPage({ busy, error, pendingRoles, onLogin, onSelectRole }: LoginPageProps) {
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onLogin(loginName, password);
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">
          妆
        </div>
        <p className="eyebrow">化妆部预约系统</p>
        <h1 id="login-title">管理后台登录</h1>
        <p className="login-description">供客服与管理员使用</p>

        {pendingRoles.length > 0 ? (
          <div className="role-panel">
            <h2>选择本次使用的角色</h2>
            <div className="role-list">
              {pendingRoles.map((role) => (
                <button
                  className="role-button"
                  disabled={busy}
                  key={role.roleAssignmentId}
                  onClick={() => void onSelectRole(role.roleAssignmentId)}
                  type="button"
                >
                  <span>{ROLE_NAMES[role.roleCode]}</span>
                  <small>{role.roleCode === 'ADMIN' ? '全部场地' : '所属场地'}</small>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="login-name">登录名</label>
            <input
              autoComplete="username"
              autoFocus
              disabled={busy}
              id="login-name"
              maxLength={64}
              onChange={(event) => setLoginName(event.target.value)}
              required
              value={loginName}
            />

            <label htmlFor="password">密码</label>
            <input
              autoComplete="current-password"
              disabled={busy}
              id="password"
              maxLength={128}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />

            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? '正在登录…' : '登录'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
