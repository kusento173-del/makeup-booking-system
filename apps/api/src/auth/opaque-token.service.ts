import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

@Injectable()
export class OpaqueTokenService {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
