import type { SessionTokenPair } from './auth-session';

interface DashboardShellProps {
  readonly busy: boolean;
  readonly onLogout: () => Promise<void>;
  readonly session: SessionTokenPair;
}

export function DashboardShell({ busy, onLogout, session }: DashboardShellProps) {
  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div>
          <strong>妆序管理后台</strong>
          <span>{session.role.roleCode === 'ADMIN' ? '管理员' : '客服'}</span>
        </div>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void onLogout()}
          type="button"
        >
          退出登录
        </button>
      </header>
      <main className="dashboard-content">
        <p className="eyebrow">系统管理</p>
        <h1>登录成功</h1>
        <p>人员、场地和账号管理页面将在下一步接入。</p>
      </main>
    </div>
  );
}
