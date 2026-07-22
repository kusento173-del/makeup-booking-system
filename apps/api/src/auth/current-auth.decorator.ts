import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { AuthSessionInvalidError } from './auth-session.errors';
import type { AccessTokenClaims } from './auth-session.types';
import type { AuthenticatedRequest } from './access-token.guard';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenClaims => {
    const authorization = context.switchToHttp().getRequest<AuthenticatedRequest>().authorization;

    if (!authorization) {
      throw new AuthSessionInvalidError();
    }

    return authorization;
  },
);
