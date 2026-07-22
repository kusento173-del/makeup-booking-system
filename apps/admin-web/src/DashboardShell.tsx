import type { SessionTokenPair } from './auth-session';
import { ManagementPage } from './ManagementPage';

interface DashboardShellProps {
  readonly busy: boolean;
  readonly onLogout: () => Promise<void>;
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

export function DashboardShell({ busy, onLogout, onUnauthorized, session }: DashboardShellProps) {
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
      <ManagementPage onUnauthorized={onUnauthorized} session={session} />
    </div>
  );
}
