import type { ExecutionContext } from '@nestjs/common';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';

import { InternalWorkerGuard } from './internal-worker.guard';

const originalToken = process.env.INTERNAL_WORKER_TOKEN;

function context(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: token ? { 'x-worker-token': token } : {} }),
    }),
  } as unknown as ExecutionContext;
}

afterEach(() => {
  if (originalToken === undefined) delete process.env.INTERNAL_WORKER_TOKEN;
  else process.env.INTERNAL_WORKER_TOKEN = originalToken;
});

describe('InternalWorkerGuard', () => {
  it('accepts only the exact configured worker token', () => {
    process.env.INTERNAL_WORKER_TOKEN = 'a'.repeat(32);
    const guard = new InternalWorkerGuard();

    expect(guard.canActivate(context('a'.repeat(32)))).toBe(true);
    expect(() => guard.canActivate(context('b'.repeat(32)))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });

  it('fails closed when the server token is missing', () => {
    delete process.env.INTERNAL_WORKER_TOKEN;
    expect(() => new InternalWorkerGuard().canActivate(context('a'.repeat(32)))).toThrow(
      ServiceUnavailableException,
    );
  });
});
