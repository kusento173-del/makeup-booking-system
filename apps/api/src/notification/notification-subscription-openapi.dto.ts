import { ApiProperty } from '@nestjs/swagger';

export class NotificationSubscriptionTemplateDto {
  @ApiProperty()
  providerTemplateKey!: string;

  @ApiProperty({
    enum: ['APPOINTMENT_NOTICE', 'APPOINTMENT_REMINDER', 'DAILY_SCHEDULE_SUMMARY'],
  })
  templateCode!: string;

  @ApiProperty({ format: 'uuid' })
  templateVersionId!: string;
}

export class NotificationSubscriptionGroupDto {
  @ApiProperty({ format: 'uuid' })
  requestId!: string;

  @ApiProperty({ enum: ['ONE_TIME', 'PERMANENT'] })
  subscriptionType!: string;

  @ApiProperty({ isArray: true, type: NotificationSubscriptionTemplateDto })
  templates!: NotificationSubscriptionTemplateDto[];
}

export class NotificationSubscriptionDecisionDto {
  @ApiProperty({ enum: ['ACCEPT', 'REJECT', 'BAN', 'FILTER'] })
  decision!: string;

  @ApiProperty({ format: 'uuid' })
  templateVersionId!: string;
}

export class RecordNotificationSubscriptionRequestDto {
  @ApiProperty({
    isArray: true,
    maxItems: 5,
    minItems: 1,
    type: NotificationSubscriptionDecisionDto,
  })
  decisions!: NotificationSubscriptionDecisionDto[];

  @ApiProperty({ format: 'uuid' })
  requestId!: string;
}

export class NotificationSubscriptionRecordedDto {
  @ApiProperty({ maximum: 5, minimum: 1 })
  recordedCount!: number;

  @ApiProperty({ format: 'uuid' })
  requestId!: string;
}
