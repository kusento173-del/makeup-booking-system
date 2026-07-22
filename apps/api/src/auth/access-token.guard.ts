import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { AuthSessionInvalidError } from './auth-session.errors';
import { AuthSessionService } from './auth-session.service';
import type { AccessTokenClaims } from './auth-session.types';

export interface AuthenticatedRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  authorization?: AccessTokenClaims;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly sessions: AuthSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers['authorization'];

    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw new AuthSessionInvalidError();
    }

    const token = authorization.slice('Bearer '.length).trim();

    if (!token) {
      throw new AuthSessionInvalidError();
    }

    request.authorization = await this.sessions.authenticate(token);
    return true;
  }
}
