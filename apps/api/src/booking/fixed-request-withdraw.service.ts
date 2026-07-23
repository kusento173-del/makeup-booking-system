import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import { FixedRequestNotFoundError, FixedRequestStateConflictError } from './fixed-request.errors';
import type {
  FixedRequestCommandContext,
  FixedRequestWithdrawResult,
  WithdrawFixedRequestCommand,
} from './fixed-request.types';

const WITHDRAW_SELECT = {
  hostId: true,
  id: true,
  rowVersion: true,
  siteId: true,
  status: true,
  submittedByUserId: true,
} satisfies Prisma.FixedAppointmentRequestSelect;

@Injectable()
export class FixedRequestWithdrawService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  withdraw(
    context: FixedRequestCommandContext,
    command: WithdrawFixedRequestCommand,
  ): Promise<FixedRequestWithdrawResult> {
    this.authorization.assertRole(context, ['OPERATOR']);
    return this.database.transaction(async (transaction) => {
      await acquireTransactionLock(transaction, `fixed:request:${command.requestId}`);
      const request = await transaction.fixedAppointmentRequest.findUnique({
        select: WITHDRAW_SELECT,
        where: { id: command.requestId },
      });
      if (!request) throw new FixedRequestNotFoundError();
      if (
        request.submittedByUserId !== context.userId ||
        request.status !== 'PENDING' ||
        request.rowVersion !== command.expectedRowVersion
      ) {
        throw new FixedRequestStateConflictError();
      }
      const updated = await transaction.fixedAppointmentRequest.updateMany({
        data: { rowVersion: { increment: 1 }, status: 'WITHDRAWN' },
        where: {
          id: request.id,
          rowVersion: command.expectedRowVersion,
          status: 'PENDING',
          submittedByUserId: context.userId,
        },
      });
      if (updated.count !== 1) throw new FixedRequestStateConflictError();

      const result: FixedRequestWithdrawResult = {
        id: request.id,
        rowVersion: command.expectedRowVersion + 1,
        status: 'WITHDRAWN',
      };
      await this.audit.append(transaction, context, {
        action: 'FIXED_APPOINTMENT_REQUEST_WITHDRAWN',
        afterData: { ...result },
        beforeData: { rowVersion: request.rowVersion, status: request.status },
        objectId: request.id,
        objectType: 'FIXED_APPOINTMENT_REQUEST',
        reason: '提交运营主动撤回',
        siteId: request.siteId,
      });
      return result;
    });
  }
}
