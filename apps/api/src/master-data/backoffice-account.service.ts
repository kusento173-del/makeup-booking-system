import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import { normalizeBackofficeLoginName } from '../auth/backoffice-login-name';
import { PasswordHasherService } from '../auth/password-hasher.service';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import {
  BackofficeAccountConflictError,
  BackofficeAccountNotFoundError,
  LastAdministratorError,
} from './backoffice-account.errors';
import type {
  AssignBackofficeRoleCommand,
  BackofficeAccountContext,
  BackofficeAccountPage,
  BackofficeAccountPageInput,
  BackofficeRoleCode,
  CreateBackofficeAccountCommand,
  RevokeBackofficeRoleCommand,
  UpdateBackofficeAccountCommand,
} from './backoffice-account.types';
import { MasterDataInactiveSiteError, MasterDataVersionConflictError } from './master-data.errors';
import { requiredMasterDataText } from './master-data-text';

@Injectable()
export class BackofficeAccountService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
    private readonly passwords: PasswordHasherService,
  ) {}

  list(
    context: BackofficeAccountContext,
    input: BackofficeAccountPageInput,
  ): Promise<BackofficeAccountPage> {
    this.authorization.assertRole(context, ['ADMIN']);

    return this.database.read(async (client) => {
      const backofficeScope: Prisma.AppUserWhereInput = {
        OR: [
          {
            identities: {
              some: { provider: 'PASSWORD', providerAppId: 'BACKOFFICE' },
            },
          },
          {
            roles: {
              some: { revokedAt: null, roleCode: { in: ['ADMIN', 'CUSTOMER_SERVICE'] } },
            },
          },
        ],
      };
      const where: Prisma.AppUserWhereInput = input.search
        ? {
            AND: [
              backofficeScope,
              {
                OR: [
                  { displayName: { contains: input.search, mode: 'insensitive' } },
                  {
                    identities: {
                      some: {
                        externalSubject: { contains: input.search, mode: 'insensitive' },
                        provider: 'PASSWORD',
                        providerAppId: 'BACKOFFICE',
                      },
                    },
                  },
                ],
              },
            ],
          }
        : backofficeScope;
      const [accounts, total] = await Promise.all([
        client.appUser.findMany({
          orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
          select: {
            displayName: true,
            id: true,
            identities: {
              select: { externalSubject: true },
              where: { provider: 'PASSWORD', providerAppId: 'BACKOFFICE' },
            },
            roles: {
              select: { id: true, roleCode: true, rowVersion: true, siteId: true },
              where: { revokedAt: null, roleCode: { in: ['ADMIN', 'CUSTOMER_SERVICE'] } },
            },
            rowVersion: true,
            status: true,
          },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          where,
        }),
        client.appUser.count({ where }),
      ]);

      return {
        items: accounts.map((account) => ({
          displayName: account.displayName,
          id: account.id,
          loginName: account.identities[0]?.externalSubject ?? null,
          roles: account.roles.map((role) => ({
            id: role.id,
            roleCode: role.roleCode as BackofficeRoleCode,
            rowVersion: role.rowVersion,
            siteId: role.siteId,
          })),
          rowVersion: account.rowVersion,
          status: account.status as 'ACTIVE' | 'DISABLED',
        })),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    });
  }

  async create(
    context: BackofficeAccountContext,
    command: CreateBackofficeAccountCommand,
  ): Promise<string> {
    this.authorization.assertRole(context, ['ADMIN']);
    const loginName = normalizeBackofficeLoginName(command.loginName);
    const displayName = requiredMasterDataText(command.displayName, 'displayName');
    if (!loginName) {
      throw new BackofficeAccountConflictError();
    }
    const passwordHash = await this.passwords.hash(command.password);

    return this.database.transaction(async (transaction) => {
      await this.assertRoleSite(transaction, command.roleCode, command.siteId);
      const user = await transaction.appUser.create({
        data: { displayName, status: 'ACTIVE' },
        select: { id: true },
      });
      await transaction.userIdentity.create({
        data: {
          externalSubject: loginName,
          provider: 'PASSWORD',
          providerAppId: 'BACKOFFICE',
          userId: user.id,
        },
      });
      await transaction.passwordCredential.create({ data: { passwordHash, userId: user.id } });
      const role = await transaction.userRole.create({
        data: {
          assignedByUserId: context.userId,
          roleCode: command.roleCode,
          siteId: command.siteId ?? null,
          userId: user.id,
        },
        select: { id: true },
      });
      await this.audit.append(transaction, context, {
        action: 'BACKOFFICE_ACCOUNT_CREATED',
        afterData: {
          displayName,
          loginName,
          roleAssignmentId: role.id,
          roleCode: command.roleCode,
          siteId: command.siteId ?? null,
          status: 'ACTIVE',
        },
        objectId: user.id,
        objectType: 'APP_USER',
        ...(command.siteId ? { siteId: command.siteId } : {}),
      });

      return user.id;
    });
  }

  update(
    context: BackofficeAccountContext,
    command: UpdateBackofficeAccountCommand,
  ): Promise<void> {
    this.authorization.assertRole(context, ['ADMIN']);
    const displayName = requiredMasterDataText(command.displayName, 'displayName');
    const reason = requiredMasterDataText(command.reason, 'reason');

    return this.database.transaction(async (transaction) => {
      await acquireTransactionLock(transaction, 'BACKOFFICE_ADMIN_ROLES');
      const before = await transaction.appUser.findUnique({
        select: {
          displayName: true,
          id: true,
          roles: { select: { roleCode: true }, where: { revokedAt: null } },
          rowVersion: true,
          status: true,
        },
        where: { id: command.id },
      });
      if (!before) {
        throw new BackofficeAccountNotFoundError();
      }
      if (command.status === 'DISABLED' && before.status === 'ACTIVE') {
        await this.assertNotLastAdministrator(
          transaction,
          before.roles.some((role) => role.roleCode === 'ADMIN'),
        );
      }
      const updated = await transaction.appUser.updateMany({
        data: {
          displayName,
          rowVersion: { increment: 1 },
          status: command.status,
        },
        where: { id: command.id, rowVersion: command.expectedRowVersion },
      });
      this.assertUpdated(updated.count);
      const revoked =
        command.status === 'DISABLED'
          ? await transaction.authSession.updateMany({
              data: {
                revokeReason: 'ACCOUNT_DISABLED',
                revokedAt: new Date(),
                rowVersion: { increment: 1 },
              },
              where: { revokedAt: null, userId: command.id },
            })
          : { count: 0 };
      await this.audit.append(transaction, context, {
        action: 'BACKOFFICE_ACCOUNT_UPDATED',
        afterData: {
          displayName,
          rowVersion: before.rowVersion + 1,
          status: command.status,
          revokedSessionCount: revoked.count,
        },
        beforeData: {
          displayName: before.displayName,
          rowVersion: before.rowVersion,
          status: before.status,
        },
        objectId: before.id,
        objectType: 'APP_USER',
        reason,
      });
    });
  }

  assignRole(
    context: BackofficeAccountContext,
    command: AssignBackofficeRoleCommand,
  ): Promise<string> {
    this.authorization.assertRole(context, ['ADMIN']);

    return this.database.transaction(async (transaction) => {
      const user = await transaction.appUser.findUnique({
        select: {
          id: true,
          identities: {
            select: { id: true },
            where: { provider: 'PASSWORD', providerAppId: 'BACKOFFICE', status: 'ACTIVE' },
          },
          status: true,
        },
        where: { id: command.userId },
      });
      if (!user) {
        throw new BackofficeAccountNotFoundError();
      }
      if (user.status !== 'ACTIVE' || user.identities.length !== 1) {
        throw new BackofficeAccountConflictError();
      }
      await this.assertRoleSite(transaction, command.roleCode, command.siteId);
      const role = await transaction.userRole.create({
        data: {
          assignedByUserId: context.userId,
          roleCode: command.roleCode,
          siteId: command.siteId ?? null,
          userId: command.userId,
        },
        select: { id: true },
      });
      await this.audit.append(transaction, context, {
        action: 'BACKOFFICE_ROLE_ASSIGNED',
        afterData: {
          roleCode: command.roleCode,
          siteId: command.siteId ?? null,
          userId: command.userId,
        },
        objectId: role.id,
        objectType: 'USER_ROLE',
        ...(command.siteId ? { siteId: command.siteId } : {}),
      });
      return role.id;
    });
  }

  revokeRole(
    context: BackofficeAccountContext,
    command: RevokeBackofficeRoleCommand,
  ): Promise<void> {
    this.authorization.assertRole(context, ['ADMIN']);
    const reason = requiredMasterDataText(command.reason, 'reason');

    return this.database.transaction(async (transaction) => {
      await acquireTransactionLock(transaction, 'BACKOFFICE_ADMIN_ROLES');
      const before = await transaction.userRole.findUnique({
        select: {
          id: true,
          revokedAt: true,
          roleCode: true,
          rowVersion: true,
          siteId: true,
          userId: true,
        },
        where: { id: command.id },
      });
      if (!before || before.revokedAt || !['ADMIN', 'CUSTOMER_SERVICE'].includes(before.roleCode)) {
        throw new BackofficeAccountNotFoundError();
      }
      await this.assertNotLastAdministrator(transaction, before.roleCode === 'ADMIN');
      const now = new Date();
      const updated = await transaction.userRole.updateMany({
        data: { revokedAt: now, rowVersion: { increment: 1 } },
        where: { id: command.id, revokedAt: null, rowVersion: command.expectedRowVersion },
      });
      this.assertUpdated(updated.count);
      const revoked = await transaction.authSession.updateMany({
        data: {
          revokeReason: 'ROLE_REVOKED',
          revokedAt: now,
          rowVersion: { increment: 1 },
        },
        where: { revokedAt: null, roleAssignmentId: before.id },
      });
      await this.audit.append(transaction, context, {
        action: 'BACKOFFICE_ROLE_REVOKED',
        afterData: { revokedAt: now.toISOString(), revokedSessionCount: revoked.count },
        beforeData: {
          roleCode: before.roleCode,
          rowVersion: before.rowVersion,
          siteId: before.siteId,
          userId: before.userId,
        },
        objectId: before.id,
        objectType: 'USER_ROLE',
        reason,
        ...(before.siteId ? { siteId: before.siteId } : {}),
      });
    });
  }

  private assertUpdated(count: number): void {
    if (count !== 1) {
      throw new MasterDataVersionConflictError();
    }
  }

  private async assertNotLastAdministrator(
    transaction: Prisma.TransactionClient,
    affectsAdministrator: boolean,
  ): Promise<void> {
    if (!affectsAdministrator) {
      return;
    }
    const count = await transaction.userRole.count({
      where: { revokedAt: null, roleCode: 'ADMIN', user: { status: 'ACTIVE' } },
    });
    if (count <= 1) {
      throw new LastAdministratorError();
    }
  }

  private async assertRoleSite(
    transaction: Prisma.TransactionClient,
    roleCode: BackofficeRoleCode,
    siteId?: string,
  ): Promise<void> {
    if ((roleCode === 'ADMIN' && siteId) || (roleCode === 'CUSTOMER_SERVICE' && !siteId)) {
      throw new BackofficeAccountConflictError();
    }
    if (!siteId) {
      return;
    }
    const site = await transaction.site.findUnique({
      select: { status: true },
      where: { id: siteId },
    });
    if (!site) {
      throw new BackofficeAccountNotFoundError();
    }
    if (site.status !== 'ACTIVE') {
      throw new MasterDataInactiveSiteError();
    }
  }
}
