import { ApiProperty } from '@nestjs/swagger';

export class RetryNotificationTaskRequestDto {
  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;

  @ApiProperty({ maxLength: 500 })
  reason!: string;
}

export class NotificationTaskSummaryDto {
  @ApiProperty({ minimum: 0 })
  attemptCount!: number;

  @ApiProperty()
  canRetry!: boolean;

  @ApiProperty({ format: 'date-time', nullable: true })
  cancelledAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  failedAt!: string | null;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true })
  lastErrorCode!: string | null;

  @ApiProperty({ nullable: true })
  lastErrorSummary!: string | null;

  @ApiProperty({ minimum: 1 })
  maxAttempts!: number;

  @ApiProperty()
  recipientName!: string;

  @ApiProperty({ enum: ['HOST', 'ARTIST', 'OPERATOR'] })
  recipientRoleCode!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  retriedByTaskId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  retryOfTaskId!: string | null;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ format: 'date-time' })
  scheduledAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  sentAt!: string | null;

  @ApiProperty({ format: 'uuid' })
  siteId!: string;

  @ApiProperty()
  siteName!: string;

  @ApiProperty({
    enum: ['PENDING', 'PROCESSING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  })
  status!: string;

  @ApiProperty({
    enum: ['APPOINTMENT_NOTICE', 'APPOINTMENT_REMINDER', 'DAILY_SCHEDULE_SUMMARY'],
  })
  templateCode!: string;
}

export class NotificationTaskPageDto {
  @ApiProperty({ isArray: true, type: NotificationTaskSummaryDto })
  items!: NotificationTaskSummaryDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  total!: number;
}

export class RetriedNotificationTaskDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}
