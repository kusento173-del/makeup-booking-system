import { Module } from '@nestjs/common';

import { AuditEntryFactory } from './audit-entry.factory';
import { AuditSnapshotSanitizerService } from './audit-snapshot-sanitizer.service';

@Module({
  providers: [AuditEntryFactory, AuditSnapshotSanitizerService],
  exports: [AuditEntryFactory],
})
export class AuditModule {}
