import { Injectable } from '@nestjs/common';

import { AuditSnapshotSanitizerService } from './audit-snapshot-sanitizer.service';
import type { AuditEntryDraft, CreateAuditEntryInput } from './audit.types';

export class InvalidAuditEntryError extends Error {
  readonly code = 'INVALID_AUDIT_ENTRY';

  constructor(message: string) {
    super(message);
    this.name = 'InvalidAuditEntryError';
  }
}

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new InvalidAuditEntryError(`${field} must not be blank`);
  }

  return normalized;
}

@Injectable()
export class AuditEntryFactory {
  constructor(private readonly sanitizer: AuditSnapshotSanitizerService) {}

  create(input: CreateAuditEntryInput): AuditEntryDraft {
    const actorUserId = optionalText(input.actorUserId);

    if ((input.actorRole === 'SYSTEM') === (actorUserId !== null)) {
      throw new InvalidAuditEntryError(
        'System entries cannot have a user; user entries must have one',
      );
    }

    if (input.beforeData === undefined && input.afterData === undefined) {
      throw new InvalidAuditEntryError('An audit entry requires a before or after snapshot');
    }

    return {
      action: requiredText(input.action, 'action'),
      actorNameSnapshot: requiredText(input.actorName, 'actorName'),
      actorRole: input.actorRole,
      actorUserId,
      afterData: input.afterData ? this.sanitizer.sanitize(input.afterData) : null,
      beforeData: input.beforeData ? this.sanitizer.sanitize(input.beforeData) : null,
      clientType: optionalText(input.clientType),
      ipAddress: optionalText(input.ipAddress),
      objectId: requiredText(input.objectId, 'objectId'),
      objectType: requiredText(input.objectType, 'objectType'),
      reason: optionalText(input.reason),
      requestId: optionalText(input.requestId),
      siteId: optionalText(input.siteId),
      userAgent: optionalText(input.userAgent),
    };
  }
}
