import { ApiProperty } from '@nestjs/swagger';

export class CreateNotificationTemplateRequestDto {
  @ApiProperty({ maxLength: 128 })
  providerTemplateKey!: string;

  @ApiProperty({
    enum: ['APPOINTMENT_CANCELLED', 'APPOINTMENT_CREATED', 'APPOINTMENT_RESCHEDULED'],
  })
  templateCode!: string;

  @ApiProperty({
    example: ['thing1=hostName', 'date2=appointmentDate', 'time3=timeRange'],
    isArray: true,
    maxItems: 32,
    type: String,
  })
  variableMappings!: string[];
}

export class ActivateNotificationTemplateRequestDto {
  @ApiProperty({ minimum: 1 })
  expectedRowVersion!: number;
}

export class RetireNotificationTemplateRequestDto extends ActivateNotificationTemplateRequestDto {
  @ApiProperty({ maxLength: 500 })
  reason!: string;
}

export class NotificationTemplateSummaryDto {
  @ApiProperty({ format: 'date-time', nullable: true })
  activatedAt!: string | null;

  @ApiProperty({ enum: ['WECHAT_MINI_PROGRAM'] })
  channel!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true })
  providerTemplateKey!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  retiredAt!: string | null;

  @ApiProperty({ minimum: 1 })
  rowVersion!: number;

  @ApiProperty({ enum: ['ACTIVE', 'DRAFT', 'RETIRED'] })
  status!: string;

  @ApiProperty({
    enum: ['APPOINTMENT_CANCELLED', 'APPOINTMENT_CREATED', 'APPOINTMENT_RESCHEDULED'],
  })
  templateCode!: string;

  @ApiProperty({ isArray: true, type: String })
  variableMappings!: string[];

  @ApiProperty({ minimum: 1 })
  version!: number;
}

export class NotificationTemplatePreviewDto {
  @ApiProperty({ additionalProperties: true, type: Object })
  data!: Record<string, { value: string }>;

  @ApiProperty({ nullable: true })
  providerTemplateKey!: string | null;

  @ApiProperty()
  templateCode!: string;
}
