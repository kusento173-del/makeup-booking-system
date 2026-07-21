import { Module } from '@nestjs/common';

import { AuditEntryFactory } from './audit-entry.factory';
import { AuditLogRepository } from './audit-log.repository';
import { AuditSnapshotSanitizerService } from './audit-snapshot-sanitizer.service';

@Module({
  providers: [AuditEntryFactory, AuditLogRepository, AuditSnapshotSanitizerService],
  exports: [AuditEntryFactory, AuditLogRepository],
})
export class AuditModule {}
