import { timingSafeEqual } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

interface HeaderRequest {
  readonly headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class InternalWorkerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configured = process.env.INTERNAL_WORKER_TOKEN;
    if (!configured || configured.length < 32) throw new ServiceUnavailableException();
    const header = context.switchToHttp().getRequest<HeaderRequest>().headers['x-worker-token'];
    const supplied = Array.isArray(header) ? header[0] : header;
    if (!supplied || !this.equal(configured, supplied)) throw new UnauthorizedException();
    return true;
  }

  private equal(expected: string, supplied: string): boolean {
    const left = Buffer.from(expected);
    const right = Buffer.from(supplied);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
