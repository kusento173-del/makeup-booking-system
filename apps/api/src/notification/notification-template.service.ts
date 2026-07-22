import { Prisma } from '@makeup/database';
import { Injectable } from '@nestjs/common';

import { AuditCommandService } from '../audit/audit-command.service';
import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import {
  mappedTemplateData,
  NOTIFICATION_TEMPLATE_SAMPLE_FIELDS,
  WECHAT_VARIABLE_MAPPING,
} from './notification-template.definition';
import {
  NotificationTemplateNotFoundError,
  NotificationTemplateRequestInvalidError,
  NotificationTemplateStateConflictError,
} from './notification-template.errors';
import type {
  CreateNotificationTemplateCommand,
  NotificationTemplateCode,
  NotificationTemplateCommandContext,
  NotificationTemplatePreview,
  NotificationTemplateSummary,
  TransitionNotificationTemplateCommand,
} from './notification-template.types';

const TEMPLATE_SELECT = {
  activatedAt: true,
  channel: true,
  createdAt: true,
  id: true,
  providerTemplateKey: true,
  retiredAt: true,
  rowVersion: true,
  status: true,
  subscriptionType: true,
  templateCode: true,
  variableKeys: true,
  version: true,
} satisfies Prisma.NotificationTemplateVersionSelect;

type TemplateRecord = Prisma.NotificationTemplateVersionGetPayload<{
  select: typeof TEMPLATE_SELECT;
}>;

@Injectable()
export class NotificationTemplateService {
  constructor(
    private readonly audit: AuditCommandService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  list(context: VerifiedAuthorizationContext): Promise<readonly NotificationTemplateSummary[]> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    return this.database.read((client) =>
      client.notificationTemplateVersion
        .findMany({
          orderBy: [{ templateCode: 'asc' }, { version: 'desc' }],
          select: TEMPLATE_SELECT,
          where: { channel: 'WECHAT_MINI_PROGRAM' },
        })
        .then((items) => items.map((item) => this.summary(item))),
    );
  }

  preview(context: VerifiedAuthorizationContext, id: string): Promise<NotificationTemplatePreview> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    return this.database.read(async (client) => {
      const template = await client.notificationTemplateVersion.findFirst({
        select: TEMPLATE_SELECT,
        where: { channel: 'WECHAT_MINI_PROGRAM', id },
      });
      if (!template) throw new NotificationTemplateNotFoundError();
      const templateCode = this.templateCode(template.templateCode);
      return {
        data: mappedTemplateData(templateCode, template.variableKeys),
        providerTemplateKey: template.providerTemplateKey,
        templateCode,
      };
    });
  }

  createDraft(
    context: NotificationTemplateCommandContext,
    command: CreateNotificationTemplateCommand,
  ): Promise<NotificationTemplateSummary> {
    this.authorization.assertRole(context, ['ADMIN']);
    const providerTemplateKey = command.providerTemplateKey.normalize('NFKC').trim();
    const variableMappings = command.variableMappings.map((mapping) =>
      mapping.normalize('NFKC').trim(),
    );
    this.validate(command.templateCode, providerTemplateKey, variableMappings);

    return this.database.transaction(async (transaction) => {
      await acquireTransactionLock(
        transaction,
        `notification-template:${command.templateCode}:WECHAT_MINI_PROGRAM`,
      );
      const latest = await transaction.notificationTemplateVersion.findFirst({
        orderBy: { version: 'desc' },
        select: { version: true },
        where: { templateCode: command.templateCode },
      });
      const version = (latest?.version ?? 0) + 1;
      if (version > 32_767) throw new NotificationTemplateStateConflictError();
      const created = await transaction.notificationTemplateVersion.create({
        data: {
          channel: 'WECHAT_MINI_PROGRAM',
          providerTemplateKey,
          subscriptionType: command.subscriptionType,
          templateCode: command.templateCode,
          variableKeys: variableMappings,
          version,
        },
        select: TEMPLATE_SELECT,
      });
      await this.audit.append(transaction, context, {
        action: 'NOTIFICATION_TEMPLATE_DRAFT_CREATED',
        afterData: this.auditSnapshot(created),
        objectId: created.id,
        objectType: 'NOTIFICATION_TEMPLATE',
      });
      return this.summary(created);
    });
  }

  activate(
    context: NotificationTemplateCommandContext,
    id: string,
    command: TransitionNotificationTemplateCommand,
    now = new Date(),
  ): Promise<NotificationTemplateSummary> {
    this.authorization.assertRole(context, ['ADMIN']);
    return this.database.transaction(async (transaction) => {
      const draft = await transaction.notificationTemplateVersion.findUnique({
        select: TEMPLATE_SELECT,
        where: { id },
      });
      if (!draft) throw new NotificationTemplateNotFoundError();
      if (
        draft.channel !== 'WECHAT_MINI_PROGRAM' ||
        draft.status !== 'DRAFT' ||
        draft.rowVersion !== command.expectedRowVersion
      ) {
        throw new NotificationTemplateStateConflictError();
      }
      await acquireTransactionLock(
        transaction,
        `notification-template:${draft.templateCode}:WECHAT_MINI_PROGRAM`,
      );
      const active = await transaction.notificationTemplateVersion.findFirst({
        select: TEMPLATE_SELECT,
        where: {
          channel: 'WECHAT_MINI_PROGRAM',
          status: 'ACTIVE',
          templateCode: draft.templateCode,
        },
      });
      if (active) {
        const retired = await transaction.notificationTemplateVersion.update({
          data: { retiredAt: now, rowVersion: { increment: 1 }, status: 'RETIRED' },
          select: TEMPLATE_SELECT,
          where: { id: active.id },
        });
        await this.audit.append(transaction, context, {
          action: 'NOTIFICATION_TEMPLATE_RETIRED_BY_ACTIVATION',
          afterData: this.auditSnapshot(retired),
          beforeData: this.auditSnapshot(active),
          objectId: active.id,
          objectType: 'NOTIFICATION_TEMPLATE',
        });
      }
      const activated = await transaction.notificationTemplateVersion.updateManyAndReturn({
        data: { activatedAt: now, rowVersion: { increment: 1 }, status: 'ACTIVE' },
        select: TEMPLATE_SELECT,
        where: {
          id,
          rowVersion: command.expectedRowVersion,
          status: 'DRAFT',
        },
      });
      const current = activated[0];
      if (!current) throw new NotificationTemplateStateConflictError();
      await this.audit.append(transaction, context, {
        action: 'NOTIFICATION_TEMPLATE_ACTIVATED',
        afterData: this.auditSnapshot(current),
        beforeData: this.auditSnapshot(draft),
        objectId: current.id,
        objectType: 'NOTIFICATION_TEMPLATE',
      });
      return this.summary(current);
    });
  }

  retire(
    context: NotificationTemplateCommandContext,
    id: string,
    command: TransitionNotificationTemplateCommand,
    now = new Date(),
  ): Promise<NotificationTemplateSummary> {
    this.authorization.assertRole(context, ['ADMIN']);
    const reason = command.reason?.normalize('NFKC').trim();
    if (!reason || reason.length > 500) throw new NotificationTemplateRequestInvalidError();
    return this.database.transaction(async (transaction) => {
      const current = await transaction.notificationTemplateVersion.findUnique({
        select: TEMPLATE_SELECT,
        where: { id },
      });
      if (!current) throw new NotificationTemplateNotFoundError();
      const retired = await transaction.notificationTemplateVersion.updateManyAndReturn({
        data: { retiredAt: now, rowVersion: { increment: 1 }, status: 'RETIRED' },
        select: TEMPLATE_SELECT,
        where: {
          channel: 'WECHAT_MINI_PROGRAM',
          id,
          rowVersion: command.expectedRowVersion,
          status: 'ACTIVE',
        },
      });
      const result = retired[0];
      if (!result) throw new NotificationTemplateStateConflictError();
      await this.audit.append(transaction, context, {
        action: 'NOTIFICATION_TEMPLATE_RETIRED',
        afterData: this.auditSnapshot(result),
        beforeData: this.auditSnapshot(current),
        objectId: result.id,
        objectType: 'NOTIFICATION_TEMPLATE',
        reason,
      });
      return this.summary(result);
    });
  }

  private validate(
    templateCode: NotificationTemplateCode,
    providerTemplateKey: string,
    mappings: readonly string[],
  ): void {
    if (!providerTemplateKey || providerTemplateKey.length > 128 || mappings.length < 1) {
      throw new NotificationTemplateRequestInvalidError();
    }
    const allowed = NOTIFICATION_TEMPLATE_SAMPLE_FIELDS[templateCode];
    const providerKeys = new Set<string>();
    for (const mapping of mappings) {
      const match = WECHAT_VARIABLE_MAPPING.exec(mapping);
      const providerKey = mapping.slice(0, mapping.indexOf('='));
      const payloadKey = match?.[2];
      if (!payloadKey || !(payloadKey in allowed) || providerKeys.has(providerKey)) {
        throw new NotificationTemplateRequestInvalidError();
      }
      providerKeys.add(providerKey);
    }
  }

  private templateCode(value: string): NotificationTemplateCode {
    if (!(value in NOTIFICATION_TEMPLATE_SAMPLE_FIELDS)) {
      throw new Error('Stored notification template code is invalid');
    }
    return value as NotificationTemplateCode;
  }

  private summary(value: TemplateRecord): NotificationTemplateSummary {
    return {
      activatedAt: value.activatedAt?.toISOString() ?? null,
      channel: 'WECHAT_MINI_PROGRAM',
      createdAt: value.createdAt.toISOString(),
      id: value.id,
      providerTemplateKey: value.providerTemplateKey,
      retiredAt: value.retiredAt?.toISOString() ?? null,
      rowVersion: value.rowVersion,
      status: value.status as NotificationTemplateSummary['status'],
      subscriptionType: value.subscriptionType as NotificationTemplateSummary['subscriptionType'],
      templateCode: this.templateCode(value.templateCode),
      variableMappings: value.variableKeys,
      version: value.version,
    };
  }

  private auditSnapshot(value: TemplateRecord) {
    return {
      channel: value.channel,
      providerTemplateKey: value.providerTemplateKey,
      rowVersion: value.rowVersion,
      status: value.status,
      subscriptionType: value.subscriptionType,
      templateCode: value.templateCode,
      variableMappings: value.variableKeys,
      version: value.version,
    };
  }
}
