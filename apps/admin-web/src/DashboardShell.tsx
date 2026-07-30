import { useState } from 'react';

import { AuditPage } from './AuditPage';
import { AbsenceApprovalPage } from './AbsenceApprovalPage';
import type { SessionTokenPair } from './auth-session';
import { BackofficeNavigation, type BackofficeView } from './BackofficeNavigation';
import { ExportPage } from './ExportPage';
import { FixedRulePage } from './FixedRulePage';
import { FixedRequestApprovalPage } from './FixedRequestApprovalPage';
import { ManagementPage } from './ManagementPage';
import { MobileDashboard } from './MobileDashboard';
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

  if (session.role.roleCode !== 'ADMIN' && session.role.roleCode !== 'CUSTOMER_SERVICE') {
    return <MobileDashboard busy={busy} onLogout={onLogout} session={session} />;
  }

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
        <BackofficeNavigation onSelect={setView} view={view} />
        {view === 'schedule' ? (
          <SchedulePage onUnauthorized={onUnauthorized} session={session} />
        ) : view === 'exports' ? (
          <ExportPage onUnauthorized={onUnauthorized} session={session} />
        ) : view === 'approvals' ? (
          <ShiftApprovalPage onUnauthorized={onUnauthorized} session={session} />
        ) : view === 'overtime-approvals' ? (
          <OvertimeApprovalPage onUnauthorized={onUnauthorized} session={session} />
        ) : view === 'leave-approvals' ? (
          <AbsenceApprovalPage onUnauthorized={onUnauthorized} session={session} />
        ) : view === 'fixed-approvals' ? (
          <FixedRequestApprovalPage onUnauthorized={onUnauthorized} session={session} />
        ) : view === 'fixed-rules' ? (
          <FixedRulePage onUnauthorized={onUnauthorized} session={session} />
        ) : view === 'audit' ? (
          <AuditPage onUnauthorized={onUnauthorized} session={session} />
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
