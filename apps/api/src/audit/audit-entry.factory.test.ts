import { describe, expect, it } from 'vitest';

import { AuditEntryFactory, InvalidAuditEntryError } from './audit-entry.factory';
import { AuditSnapshotSanitizerService } from './audit-snapshot-sanitizer.service';

const factory = new AuditEntryFactory(new AuditSnapshotSanitizerService());

describe('AuditEntryFactory', () => {
  it('removes sensitive fields recursively without mutating the source snapshot', () => {
    const afterData = {
      mobileLast4: '1234',
      profile: {
        displayName: '主播一',
        mobile: '13800001234',
      },
      sessions: [{ refresh_token: 'secret', status: 'ACTIVE' }],
    } as const;

    const entry = factory.create({
      action: 'HOST_UPDATED',
      actorName: '管理员',
      actorRole: 'ADMIN',
      actorUserId: 'user-1',
      afterData,
      objectId: 'host-1',
      objectType: 'HOST',
    });

    expect(entry.afterData).toEqual({
      mobileLast4: '1234',
      profile: { displayName: '主播一' },
      sessions: [{ status: 'ACTIVE' }],
    });
    expect(afterData.profile.mobile).toBe('13800001234');
  });

  it('requires consistent actor identity and at least one snapshot', () => {
    const baseInput = {
      action: 'SYSTEM_SYNCED',
      actorName: '系统',
      actorRole: 'SYSTEM' as const,
      objectId: 'object-1',
      objectType: 'IMPORT',
    };

    expect(() => factory.create(baseInput)).toThrow(InvalidAuditEntryError);
    expect(() => factory.create({ ...baseInput, actorUserId: 'user-1', afterData: {} })).toThrow(
      InvalidAuditEntryError,
    );
  });
});
