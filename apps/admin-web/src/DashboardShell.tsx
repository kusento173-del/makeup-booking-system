import { useState } from 'react';

import type { SessionTokenPair } from './auth-session';
import { BackofficeNavigation, type BackofficeView } from './BackofficeNavigation';
import { ExportPage } from './ExportPage';
import { ManagementPage } from './ManagementPage';
import { OvertimeApprovalPage } from './OvertimeApprovalPage';
import { SchedulePage } from './SchedulePage';
import { ShiftApprovalPage } from './ShiftApprovalPage';

interface DashboardShellProps {
  readonly busy: boolean;
  readonly onLogout: () => Promise<void>;
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

export function DashboardShell({ busy, onLogout, onUnauthorized, session }: DashboardShellProps) {
  const [view, setView] = useState<BackofficeView>('schedule');

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
      <div className="management-layout">
        <BackofficeNavigation onSelect={setView} roleCode={session.role.roleCode} view={view} />
        {view === 'schedule' ? (
          <SchedulePage onUnauthorized={onUnauthorized} session={session} />
        ) : view === 'exports' ? (
          <ExportPage onUnauthorized={onUnauthorized} session={session} />
        ) : view === 'approvals' ? (
          <ShiftApprovalPage onUnauthorized={onUnauthorized} session={session} />
        ) : view === 'overtime-approvals' ? (
          <OvertimeApprovalPage onUnauthorized={onUnauthorized} session={session} />
        ) : (
          <ManagementPage
            key={view}
            onUnauthorized={onUnauthorized}
            session={session}
            view={view}
          />
        )}
      </div>
    </div>
  );
}
