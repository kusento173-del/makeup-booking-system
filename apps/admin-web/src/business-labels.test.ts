import { describe, expect, it } from 'vitest';

import {
  approvalStatusLabel,
  auditActionLabel,
  auditObjectLabel,
  FIXED_REQUEST_TYPE_LABELS,
  roleLabel,
} from './business-labels';

describe('business labels', () => {
  it('turns workflow codes into clear Chinese labels', () => {
    expect(approvalStatusLabel('WITHDRAWN')).toBe('已撤回');
    expect(FIXED_REQUEST_TYPE_LABELS.CHANGE).toBe('修改固定');
    expect(auditActionLabel('APPOINTMENT_CREATED')).toBe('创建预约');
    expect(auditObjectLabel('APPOINTMENT')).toBe('预约');
    expect(roleLabel('CUSTOMER_SERVICE')).toBe('客服');
  });

  it('does not expose unknown English codes to business users', () => {
    expect(approvalStatusLabel('NEW_STATUS')).toBe('状态未知');
    expect(auditActionLabel('NEW_ACTION')).toBe('其他系统操作');
    expect(auditObjectLabel('NEW_OBJECT')).toBe('其他业务数据');
    expect(roleLabel('NEW_ROLE')).toBe('系统人员');
  });
});
