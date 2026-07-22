import { Algorithm, hash, verify } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';

import { AuthRequestInvalidError } from './auth-request.parser';

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  outputLen: 32,
  parallelism: 1,
  timeCost: 2,
} as const;

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$28tU5rH9ewlvump+ZBsTDA$fPtfl+aQqAPvfQ+Nsk6DU5zZJBGvtU9KwUM0CyQWbBw';

@Injectable()
export class PasswordHasherService {
  hash(password: string): Promise<string> {
    this.assertPassword(password);
    return hash(password, ARGON2_OPTIONS);
  }

  verify(passwordHash: string | null, password: string): Promise<boolean> {
    if (typeof password !== 'string' || password.length > 128) {
      return Promise.resolve(false);
    }

    return verify(passwordHash ?? DUMMY_PASSWORD_HASH, password).catch(() => false);
  }

  assertPassword(password: string): void {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw new AuthRequestInvalidError();
    }
  }
}
