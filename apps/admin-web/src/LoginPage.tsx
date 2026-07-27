import { type FormEvent, useState } from 'react';

import type { SessionRole } from './auth-session';

interface LoginPageProps {
  readonly busy: boolean;
  readonly error: string | null;
  readonly passwordChangeRequired: boolean;
  readonly pendingRoles: readonly SessionRole[];
  readonly onCompletePasswordChange: (newPassword: string) => Promise<void>;
  readonly onLogin: (loginName: string, password: string) => Promise<void>;
  readonly onSelectRole: (roleAssignmentId: string) => Promise<void>;
}

const ROLE_NAMES: Record<SessionRole['roleCode'], string> = {
  ADMIN: '管理员',
  ARTIST: '化妆师',
  CUSTOMER_SERVICE: '客服',
  HOST: '主播',
  OPERATOR: '运营',
};

export function LoginPage({
  busy,
  error,
  passwordChangeRequired,
  pendingRoles,
  onCompletePasswordChange,
  onLogin,
  onSelectRole,
}: LoginPageProps) {
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onLogin(loginName, password);
  }

  function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setLocalError('两次输入的新密码不一致');
      return;
    }
    setLocalError(null);
    void onCompletePasswordChange(newPassword);
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">
          妆
        </div>
        <p className="eyebrow">化妆部预约系统</p>
        <h1 id="login-title">{passwordChangeRequired ? '设置新密码' : '账号登录'}</h1>
        <p className="login-description">
          {passwordChangeRequired
            ? '首次登录必须修改临时密码，保存后才能进入系统。'
            : '主播、运营、化妆师、客服与管理员统一入口'}
        </p>

        {passwordChangeRequired ? (
          <form onSubmit={submitPasswordChange}>
            <label htmlFor="new-password">新密码</label>
            <input
              autoComplete="new-password"
              autoFocus
              disabled={busy}
              id="new-password"
              maxLength={128}
              minLength={12}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
            <p className="field-hint">至少 12 位，请勿继续使用临时密码。</p>

            <label htmlFor="confirm-password">确认新密码</label>
            <input
              autoComplete="new-password"
              disabled={busy}
              id="confirm-password"
              maxLength={128}
              minLength={12}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />

            {localError || error ? <p className="form-error">{localError ?? error}</p> : null}
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? '正在保存…' : '保存并进入系统'}
            </button>
          </form>
        ) : pendingRoles.length > 0 ? (
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
                  <small>{role.siteId ? '所属场地' : '全部场地'}</small>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={submitLogin}>
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
