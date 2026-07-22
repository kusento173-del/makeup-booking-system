import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AccessTokenGuard, type AuthenticatedRequest } from './access-token.guard';
import { AuthSessionInvalidError } from './auth-session.errors';
import type { AuthSessionService } from './auth-session.service';

function context(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AccessTokenGuard', () => {
  it('authenticates a bearer token and attaches only verified claims', async () => {
    const claims = {
      expiresAt: new Date(Date.now() + 60_000),
      roleAssignmentId: 'role-1',
      roleCode: 'HOST',
      sessionId: 'session-1',
      siteId: null,
      userId: 'user-1',
    } as const;
    const authenticate = vi.fn().mockResolvedValue(claims);
    const guard = new AccessTokenGuard({ authenticate } as unknown as AuthSessionService);
    const request: AuthenticatedRequest = { headers: { authorization: 'Bearer access-token' } };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith('access-token');
    expect(request.authorization).toBe(claims);
  });

  it('rejects missing or malformed bearer credentials', async () => {
    const guard = new AccessTokenGuard({} as AuthSessionService);

    await expect(guard.canActivate(context({ headers: {} }))).rejects.toBeInstanceOf(
      AuthSessionInvalidError,
    );
    await expect(
      guard.canActivate(context({ headers: { authorization: 'Basic forged' } })),
    ).rejects.toBeInstanceOf(AuthSessionInvalidError);
  });
});
