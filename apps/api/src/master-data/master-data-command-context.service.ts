import { Injectable } from '@nestjs/common';

import { AuthSessionInvalidError } from '../auth/auth-session.errors';
import type { AccessTokenClaims } from '../auth/auth-session.types';
import { DatabaseService } from '../database/database.service';
import type { MasterDataCommandContext } from './master-data-command.types';

export interface MasterDataRequestMetadata {
  readonly clientType?: string;
  readonly ipAddress?: string;
  readonly requestId?: string;
  readonly userAgent?: string;
}

@Injectable()
export class MasterDataCommandContextService {
  constructor(private readonly database: DatabaseService) {}

  async resolve(
    authorization: AccessTokenClaims,
    metadata: MasterDataRequestMetadata,
  ): Promise<MasterDataCommandContext> {
    const user = await this.database.read((database) =>
      database.appUser.findFirst({
        select: { displayName: true },
        where: {
          id: authorization.userId,
          roles: {
            some: {
              id: authorization.roleAssignmentId,
              revokedAt: null,
              roleCode: authorization.roleCode,
              siteId: authorization.siteId,
            },
          },
          status: 'ACTIVE',
        },
      }),
    );

    if (!user) {
      throw new AuthSessionInvalidError();
    }

    const clientType = this.text(metadata.clientType, 32);
    const ipAddress = this.text(metadata.ipAddress, 64);
    const requestId = this.text(metadata.requestId, 64);
    const userAgent = this.text(metadata.userAgent, 500);

    return {
      actorName: user.displayName,
      ...authorization,
      ...(clientType ? { clientType } : {}),
      ...(ipAddress ? { ipAddress } : {}),
      ...(requestId ? { requestId } : {}),
      ...(userAgent ? { userAgent } : {}),
    };
  }

  private text(value: string | undefined, maximumLength: number): string | undefined {
    const normalized = value?.normalize('NFKC').trim();
    return normalized ? normalized.slice(0, maximumLength) : undefined;
  }
}
