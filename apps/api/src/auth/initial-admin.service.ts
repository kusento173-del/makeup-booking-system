import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import { normalizeBackofficeLoginName } from './backoffice-login-name';
import {
  InitialAdminAlreadyExistsError,
  InitialAdminInputInvalidError,
  InitialAdminLoginNameExistsError,
} from './initial-admin.errors';
import { PasswordHasherService } from './password-hasher.service';

export interface InitialAdminResult {
  readonly loginName: string;
  readonly userId: string;
}

@Injectable()
export class InitialAdminService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly database: DatabaseService,
    private readonly passwords: PasswordHasherService,
  ) {}

  async create(
    loginName: string,
    displayName: string,
    password: string,
  ): Promise<InitialAdminResult> {
    const normalizedLoginName = normalizeBackofficeLoginName(loginName);
    const normalizedDisplayName = displayName.normalize('NFKC').trim();

    if (!normalizedLoginName || !normalizedDisplayName || normalizedDisplayName.length > 64) {
      throw new InitialAdminInputInvalidError();
    }

    this.passwords.assertPassword(password);
    const passwordHash = await this.passwords.hash(password);

    return this.database.transaction(async (transaction) => {
      await acquireTransactionLock(transaction, 'INITIAL_ADMIN');
      const activeAdministratorCount = await transaction.userRole.count({
        where: { revokedAt: null, roleCode: 'ADMIN' },
      });

      if (activeAdministratorCount > 0) {
        throw new InitialAdminAlreadyExistsError();
      }

      const existingIdentity = await transaction.userIdentity.findUnique({
        select: { id: true },
        where: {
          provider_providerAppId_externalSubject: {
            externalSubject: normalizedLoginName,
            provider: 'PASSWORD',
            providerAppId: 'BACKOFFICE',
          },
        },
      });

      if (existingIdentity) {
        throw new InitialAdminLoginNameExistsError();
      }

      const user = await transaction.appUser.create({
        data: { displayName: normalizedDisplayName, status: 'ACTIVE' },
        select: { id: true },
      });
      await transaction.userIdentity.create({
        data: {
          externalSubject: normalizedLoginName,
          provider: 'PASSWORD',
          providerAppId: 'BACKOFFICE',
          userId: user.id,
        },
      });
      await transaction.passwordCredential.create({
        data: { passwordHash, userId: user.id },
      });
      const role = await transaction.userRole.create({
        data: { roleCode: 'ADMIN', userId: user.id },
        select: { id: true },
      });
      await this.audit.append(
        transaction,
        { actorName: '系统初始化', roleCode: 'SYSTEM' },
        {
          action: 'INITIAL_ADMIN_CREATED',
          afterData: { loginName: normalizedLoginName, roleAssignmentId: role.id },
          objectId: user.id,
          objectType: 'APP_USER',
        },
      );

      return { loginName: normalizedLoginName, userId: user.id };
    });
  }
}
