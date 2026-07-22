import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessTokenService } from './access-token.service';
import { AuthConfigurationError, AuthSessionInvalidError } from './auth-session.errors';

const service = new AccessTokenService();
const role = {
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE',
  siteId: 'site-songjiang',
} as const;

describe('AccessTokenService', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_ACCESS_TOKEN_SECRET', 'test-secret-with-at-least-32-characters');
    vi.stubEnv('AUTH_ACCESS_TOKEN_ISSUER', 'test-issuer');
    vi.stubEnv('AUTH_ACCESS_TOKEN_AUDIENCE', 'test-audience');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('signs a 15-minute access token with the selected role and session', async () => {
    const now = new Date();
    now.setMilliseconds(0);
    const issued = await service.issue('user-1', 'session-1', role, now);

    await expect(service.verify(issued.token)).resolves.toEqual({
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
      roleAssignmentId: 'role-1',
      roleCode: 'CUSTOMER_SERVICE',
      sessionId: 'session-1',
      siteId: 'site-songjiang',
      userId: 'user-1',
    });
  });

  it('rejects altered tokens without exposing verification details', async () => {
    const issued = await service.issue('user-1', 'session-1', role);
    const segments = issued.token.split('.');
    const signature = segments[2];

    if (!segments[0] || !segments[1] || !signature) {
      throw new Error('Issued token is not a compact JWT');
    }

    const tamperedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    const tamperedToken = `${segments[0]}.${segments[1]}.${tamperedSignature}`;

    await expect(service.verify(tamperedToken)).rejects.toBeInstanceOf(AuthSessionInvalidError);
  });

  it('refuses to sign with a short secret', async () => {
    vi.stubEnv('AUTH_ACCESS_TOKEN_SECRET', 'too-short');

    await expect(service.issue('user-1', 'session-1', role)).rejects.toBeInstanceOf(
      AuthConfigurationError,
    );
  });
});
