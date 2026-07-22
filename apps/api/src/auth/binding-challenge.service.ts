import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { OpaqueTokenService } from './opaque-token.service';

const BINDING_CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;

export interface IssuedBindingChallenge {
  readonly expiresAt: Date;
  readonly token: string;
}

export interface ResolvedBindingChallenge {
  readonly challengeId: string;
  readonly userId: string;
  readonly userStatus: string;
}

@Injectable()
export class BindingChallengeService {
  constructor(private readonly tokens: OpaqueTokenService) {}

  async issue(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<IssuedBindingChallenge> {
    const now = new Date();
    await transaction.authBindingChallenge.updateMany({
      data: { revokedAt: now },
      where: { consumedAt: null, revokedAt: null, userId },
    });
    const token = this.tokens.generate();
    const expiresAt = new Date(now.getTime() + BINDING_CHALLENGE_LIFETIME_MS);
    await transaction.authBindingChallenge.create({
      data: { expiresAt, tokenHash: this.tokens.hash(token), userId },
    });

    return { expiresAt, token };
  }

  async resolve(
    transaction: Prisma.TransactionClient,
    token: string,
  ): Promise<ResolvedBindingChallenge | null> {
    const challenge = await transaction.authBindingChallenge.findUnique({
      select: {
        consumedAt: true,
        expiresAt: true,
        id: true,
        revokedAt: true,
        user: { select: { status: true } },
        userId: true,
      },
      where: { tokenHash: this.tokens.hash(token) },
    });

    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.revokedAt ||
      challenge.expiresAt <= new Date()
    ) {
      return null;
    }

    return {
      challengeId: challenge.id,
      userId: challenge.userId,
      userStatus: challenge.user.status,
    };
  }

  async consume(
    transaction: Prisma.TransactionClient,
    challenge: ResolvedBindingChallenge,
  ): Promise<boolean> {
    const now = new Date();
    const result = await transaction.authBindingChallenge.updateMany({
      data: { consumedAt: now },
      where: {
        consumedAt: null,
        expiresAt: { gt: now },
        id: challenge.challengeId,
        revokedAt: null,
      },
    });

    return result.count === 1;
  }
}
