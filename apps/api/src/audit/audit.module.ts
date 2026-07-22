import { Module } from '@nestjs/common';

import { AuditCommandService } from './audit-command.service';
import { AuditEntryFactory } from './audit-entry.factory';
import { AuditLogRepository } from './audit-log.repository';
import { AuditSnapshotSanitizerService } from './audit-snapshot-sanitizer.service';

@Module({
  providers: [
    AuditCommandService,
    AuditEntryFactory,
    AuditLogRepository,
    AuditSnapshotSanitizerService,
  ],
  exports: [AuditCommandService, AuditEntryFactory, AuditLogRepository],
})
export class AuditModule {}
