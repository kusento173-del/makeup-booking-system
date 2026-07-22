import { useEffect, useState } from 'react';

import { ApiError } from './api-client';
import {
  loadSession,
  login,
  logoutSession,
  refreshSession,
  saveSession,
  selectRole,
  type SessionRole,
  type SessionTokenPair,
  verifySession,
} from './auth-session';
import { DashboardShell } from './DashboardShell';
import { LoginPage } from './LoginPage';

export function App() {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingChallenge, setPendingChallenge] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<readonly SessionRole[]>([]);
  const [session, setSession] = useState<SessionTokenPair | null>(null);

  useEffect(() => {
    let active = true;
    const stored = loadSession();

    async function restore() {
      if (!stored) {
        setBusy(false);
        return;
      }
      try {
        const accessExpiresAt = Date.parse(stored.accessTokenExpiresAt);
        let restored = stored;
        if (Number.isFinite(accessExpiresAt) && accessExpiresAt > Date.now() + 30_000) {
          await verifySession(stored.accessToken);
        } else {
          restored = await refreshSession(stored.refreshToken);
        }
        if (active) {
          saveSession(restored);
          setSession(restored);
        }
      } catch {
        if (active) {
          saveSession(null);
        }
      } finally {
        if (active) {
          setBusy(false);
        }
      }
    }

    void restore();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }
    const delay = Math.max(0, Date.parse(session.accessTokenExpiresAt) - Date.now() - 30_000);
    const timer = window.setTimeout(
      () => {
        void refreshSession(session.refreshToken).then(acceptSession).catch(clearSession);
      },
      Math.min(delay, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [session]);

  function acceptSession(next: SessionTokenPair) {
    saveSession(next);
    setSession(next);
    setPendingChallenge(null);
    setPendingRoles([]);
  }

  function clearSession() {
    saveSession(null);
    setSession(null);
  }

  async function handleLogin(loginName: string, password: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await login(loginName, password);
      if (result.kind === 'SESSION_CREATED') {
        acceptSession(result.session);
      } else {
        setPendingChallenge(result.roleSelectionChallenge);
        setPendingRoles(result.roles);
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '无法连接服务器，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleSelection(roleAssignmentId: string) {
    if (!pendingChallenge) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await selectRole(pendingChallenge, roleAssignmentId);
      if (result.kind !== 'SESSION_CREATED') {
        throw new Error('Unexpected role-selection result');
      }
      acceptSession(result.session);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '角色选择失败，请重新登录');
      setPendingChallenge(null);
      setPendingRoles([]);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (!session) {
      return;
    }
    setBusy(true);
    try {
      await logoutSession(session.accessToken);
    } finally {
      clearSession();
      setBusy(false);
    }
  }

  if (busy && !session && pendingRoles.length === 0) {
    return <main className="loading-page">正在加载…</main>;
  }

  if (session) {
    return (
      <DashboardShell
        busy={busy}
        onLogout={handleLogout}
        onUnauthorized={clearSession}
        session={session}
      />
    );
  }

  return (
    <LoginPage
      busy={busy}
      error={error}
      onLogin={handleLogin}
      onSelectRole={handleRoleSelection}
      pendingRoles={pendingRoles}
    />
  );
}
