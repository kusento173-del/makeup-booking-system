import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { BindingCodeHasherService } from './binding-code-hasher.service';
import type {
  BindableRoleCode,
  BindingTarget,
  ConsumeBindingCodeCommand,
  ConsumedBindingCode,
} from './binding-code.types';

@Injectable()
export class BindingCodeVerifierService {
  constructor(private readonly hasher: BindingCodeHasherService) {}

  async tryConsume(
    transaction: Prisma.TransactionClient,
    command: ConsumeBindingCodeCommand,
  ): Promise<ConsumedBindingCode | null> {
    const bindingCode = await transaction.accountBindingCode.findFirst({
      select: {
        codeHash: true,
        expiresAt: true,
        failedAttemptCount: true,
        id: true,
        maxAttempts: true,
        rowVersion: true,
        siteId: true,
      },
      where: {
        ...this.targetWhere(command),
        consumedAt: null,
        revokedAt: null,
      },
    });

    if (!bindingCode) {
      return null;
    }

    const now = new Date();

    if (bindingCode.expiresAt <= now || bindingCode.failedAttemptCount >= bindingCode.maxAttempts) {
      return null;
    }

    if (!this.hasher.matches(command.code, bindingCode.codeHash)) {
      await transaction.accountBindingCode.updateMany({
        data: {
          failedAttemptCount: { increment: 1 },
          rowVersion: { increment: 1 },
        },
        where: {
          consumedAt: null,
          failedAttemptCount: { lt: bindingCode.maxAttempts },
          id: bindingCode.id,
          revokedAt: null,
        },
      });
      return null;
    }

    const consumed = await transaction.accountBindingCode.updateMany({
      data: {
        consumedAt: now,
        consumedByUserId: command.consumerUserId,
        rowVersion: { increment: 1 },
      },
      where: {
        codeHash: bindingCode.codeHash,
        consumedAt: null,
        expiresAt: { gt: now },
        failedAttemptCount: { lt: bindingCode.maxAttempts },
        id: bindingCode.id,
        revokedAt: null,
        rowVersion: bindingCode.rowVersion,
      },
    });

    if (consumed.count !== 1) {
      return null;
    }

    return {
      bindingCodeId: bindingCode.id,
      profileId: command.profileId,
      roleCode: command.roleCode,
      siteId: bindingCode.siteId,
    };
  }

  private targetWhere(target: BindingTarget): Prisma.AccountBindingCodeWhereInput {
    const targetField: Record<BindableRoleCode, Prisma.AccountBindingCodeWhereInput> = {
      ARTIST: { artistProfileId: target.profileId },
      HOST: { hostProfileId: target.profileId },
      OPERATOR: { operatorProfileId: target.profileId },
    };

    return targetField[target.roleCode];
  }
}
