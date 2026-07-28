import type { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
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
  AccountRoleCode,
  BackofficeAccountContext,
  BackofficeAccountPage,
  BackofficeAccountPageInput,
  BackofficeRoleCode,
  CreateBackofficeAccountCommand,
  DeleteBackofficeAccountCommand,
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
    this.authorization.assertRole(context, ['ADMIN', 'CUSTOMER_SERVICE']);

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
      const conditions: Prisma.AppUserWhereInput[] = [backofficeScope];
      if (context.roleCode === 'CUSTOMER_SERVICE') {
        conditions.push(this.customerServiceVisibleAccountScope(context.siteId));
      }
      if (input.search) {
        conditions.push({
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
        });
      }
      if (input.roleCode) {
        conditions.push({
          roles: { some: { revokedAt: null, roleCode: input.roleCode } },
        });
      }
      if (input.status) {
        conditions.push({ status: input.status });
      }
      const where: Prisma.AppUserWhereInput =
        conditions.length === 1 ? backofficeScope : { AND: conditions };
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
              where: { revokedAt: null },
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
            roleCode: role.roleCode as AccountRoleCode,
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
    this.authorization.assertRole(context, ['ADMIN', 'CUSTOMER_SERVICE']);
    this.assertBackofficeRoleScope(context, command.roleCode, command.siteId);
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
      await transaction.passwordCredential.create({
        data: { mustChangePassword: true, passwordHash, userId: user.id },
      });
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
    this.authorization.assertRole(context, ['ADMIN', 'CUSTOMER_SERVICE']);
    const displayName = requiredMasterDataText(command.displayName, 'displayName');
    const reason = requiredMasterDataText(command.reason, 'reason');

    return this.database.transaction(async (transaction) => {
      const before = await transaction.appUser.findUnique({
        select: {
          displayName: true,
          artistProfile: { select: { siteId: true } },
          hostProfile: { select: { siteId: true } },
          id: true,
          operatorProfile: { select: { siteId: true } },
          roles: {
            select: { roleCode: true, siteId: true },
            where: { revokedAt: null },
          },
          rowVersion: true,
          status: true,
        },
        where: { id: command.id },
      });
      if (!before) {
        throw new BackofficeAccountNotFoundError();
      }
      this.assertCustomerServiceCanManageAccount(context, before);
      const updated = await transaction.appUser.updateMany({
        data: {
          displayName,
          rowVersion: { increment: 1 },
        },
        where: { id: command.id, rowVersion: command.expectedRowVersion },
      });
      this.assertUpdated(updated.count);
      await this.audit.append(transaction, context, {
        action: 'BACKOFFICE_ACCOUNT_UPDATED',
        afterData: {
          displayName,
          rowVersion: before.rowVersion + 1,
          status: before.status,
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

  delete(
    context: BackofficeAccountContext,
    command: DeleteBackofficeAccountCommand,
  ): Promise<void> {
    this.authorization.assertRole(context, ['ADMIN']);
    const reason = requiredMasterDataText(command.reason, 'reason');
    return this.database.transaction(async (transaction) => {
      await acquireTransactionLock(transaction, 'BACKOFFICE_ADMIN_ROLES');
      const before = await transaction.appUser.findUnique({
        select: {
          displayName: true,
          id: true,
          roles: {
            select: { roleCode: true },
            where: { revokedAt: null },
          },
          rowVersion: true,
          status: true,
        },
        where: { id: command.id },
      });
      if (!before || before.status !== 'ACTIVE') throw new BackofficeAccountNotFoundError();
      if (
        before.roles.some((role) => role.roleCode === 'ADMIN') ||
        before.roles.some((role) => ['HOST', 'ARTIST', 'OPERATOR'].includes(role.roleCode))
      ) {
        throw new BackofficeAccountConflictError();
      }
      const now = new Date();
      const updated = await transaction.appUser.updateMany({
        data: { rowVersion: { increment: 1 }, status: 'DISABLED' },
        where: { id: before.id, rowVersion: command.expectedRowVersion, status: 'ACTIVE' },
      });
      this.assertUpdated(updated.count);
      const sessions = await transaction.authSession.updateMany({
        data: {
          revokeReason: 'ACCOUNT_DELETED',
          revokedAt: now,
          rowVersion: { increment: 1 },
        },
        where: { revokedAt: null, userId: before.id },
      });
      await this.audit.append(transaction, context, {
        action: 'BACKOFFICE_ACCOUNT_DELETED',
        afterData: {
          deletedAt: now.toISOString(),
          revokedSessionCount: sessions.count,
          status: 'DISABLED',
        },
        beforeData: before,
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
    this.authorization.assertRole(context, ['ADMIN', 'CUSTOMER_SERVICE']);
    this.assertBackofficeRoleScope(context, command.roleCode, command.siteId);

    return this.database.transaction(async (transaction) => {
      const user = await transaction.appUser.findUnique({
        select: {
          artistProfile: { select: { siteId: true } },
          hostProfile: { select: { siteId: true } },
          id: true,
          identities: {
            select: { id: true },
            where: { provider: 'PASSWORD', providerAppId: 'BACKOFFICE', status: 'ACTIVE' },
          },
          operatorProfile: { select: { siteId: true } },
          roles: {
            select: { roleCode: true, siteId: true },
            where: { revokedAt: null },
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
      this.assertCustomerServiceCanManageAccount(context, user);
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
    this.authorization.assertRole(context, ['ADMIN', 'CUSTOMER_SERVICE']);
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
          user: {
            select: {
              artistProfile: { select: { siteId: true } },
              hostProfile: { select: { siteId: true } },
              operatorProfile: { select: { siteId: true } },
              roles: {
                select: { roleCode: true, siteId: true },
                where: { revokedAt: null },
              },
            },
          },
          userId: true,
        },
        where: { id: command.id },
      });
      if (!before || before.revokedAt || !['ADMIN', 'CUSTOMER_SERVICE'].includes(before.roleCode)) {
        throw new BackofficeAccountNotFoundError();
      }
      this.assertBackofficeRoleScope(context, before.roleCode as BackofficeRoleCode, before.siteId);
      this.assertCustomerServiceCanManageAccount(context, before.user);
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

  private customerServiceVisibleAccountScope(siteId: string | null): Prisma.AppUserWhereInput {
    if (!siteId) throw new AuthorizationDeniedError();
    return {
      OR: [
        { roles: { some: { revokedAt: null, roleCode: 'ADMIN' } } },
        { roles: { some: { revokedAt: null, siteId } } },
        { hostProfile: { is: { siteId } } },
        { artistProfile: { is: { siteId } } },
        { operatorProfile: { is: { siteId } } },
      ],
    };
  }

  private assertBackofficeRoleScope(
    context: BackofficeAccountContext,
    roleCode: BackofficeRoleCode,
    siteId?: string | null,
  ): void {
    if (context.roleCode === 'ADMIN') return;
    if (
      context.roleCode !== 'CUSTOMER_SERVICE' ||
      roleCode !== 'CUSTOMER_SERVICE' ||
      !context.siteId ||
      siteId !== context.siteId
    ) {
      throw new AuthorizationDeniedError();
    }
  }

  private assertCustomerServiceCanManageAccount(
    context: BackofficeAccountContext,
    account: {
      readonly artistProfile: { readonly siteId: string } | null;
      readonly hostProfile: { readonly siteId: string } | null;
      readonly operatorProfile: { readonly siteId: string } | null;
      readonly roles: readonly {
        readonly roleCode: string;
        readonly siteId: string | null;
      }[];
    },
  ): void {
    if (context.roleCode === 'ADMIN') return;
    if (
      context.roleCode !== 'CUSTOMER_SERVICE' ||
      !context.siteId ||
      account.roles.some((role) => role.roleCode === 'ADMIN')
    ) {
      throw new AuthorizationDeniedError();
    }
    const siteIds = [
      account.hostProfile?.siteId,
      account.artistProfile?.siteId,
      account.operatorProfile?.siteId,
      ...account.roles.map((role) => role.siteId),
    ];
    if (!siteIds.includes(context.siteId)) {
      throw new AuthorizationDeniedError();
    }
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
