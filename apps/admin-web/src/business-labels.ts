export const APPROVAL_STATUS_LABELS = {
  APPROVED: '已通过',
  PENDING: '待审核',
  REJECTED: '已驳回',
  WITHDRAWN: '已撤回',
} as const;

export const FIXED_REQUEST_TYPE_LABELS = {
  CANCEL: '取消固定',
  CHANGE: '修改固定',
  CREATE: '申请固定',
} as const;

export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  APPOINTMENT_CANCELLED: '取消预约',
  APPOINTMENT_CREATED: '创建预约',
  APPOINTMENT_RESCHEDULE_SOURCE_CANCELLED: '改期并取消原预约',
  ARTIST_CREATED: '新增化妆师',
  ARTIST_DELETED: '删除化妆师',
  ARTIST_OVERTIME_APPROVED: '通过加班申请',
  ARTIST_OVERTIME_DIRECTLY_APPROVED: '直接设置加班',
  ARTIST_OVERTIME_REJECTED: '驳回加班申请',
  ARTIST_OVERTIME_SUBMITTED: '提交加班申请',
  ARTIST_OVERTIME_WITHDRAWN: '撤回加班申请',
  ARTIST_SHIFT_CHANGE_APPROVED: '通过班次修改',
  ARTIST_SHIFT_CHANGE_REJECTED: '驳回班次修改',
  ARTIST_SHIFT_CHANGE_SUBMITTED: '提交班次修改',
  ARTIST_SHIFT_CHANGE_WITHDRAWN: '撤回班次修改',
  ARTIST_SHIFT_DIRECTLY_CHANGED: '直接修改化妆师班次',
  ARTIST_SHIFT_VERSION_CREATED: '生成化妆师班次版本',
  ARTIST_INITIAL_SHIFT_CONFIGURED: '设置化妆师初始班次',
  ARTIST_UNAVAILABLE_PERIOD_CANCELLED: '撤销临时不可排班',
  ARTIST_UNAVAILABLE_PERIOD_CREATED: '设置临时不可排班',
  ARTIST_UPDATED: '修改化妆师',
  BACKOFFICE_ACCOUNT_CREATED: '新增后台账号',
  BACKOFFICE_ACCOUNT_DELETED: '删除后台账号',
  BACKOFFICE_ACCOUNT_UPDATED: '修改后台账号',
  BACKOFFICE_ROLE_ASSIGNED: '分配后台角色',
  BACKOFFICE_ROLE_REVOKED: '撤销后台角色',
  FIXED_APPOINTMENT_CANCELLED_BY_RULE_REQUEST: '固定关系变更并取消原排班',
  FIXED_APPOINTMENT_GENERATED: '生成固定排班',
  FIXED_APPOINTMENT_REQUEST_APPROVED: '通过固定申请',
  FIXED_APPOINTMENT_REQUEST_REJECTED: '驳回固定申请',
  FIXED_APPOINTMENT_REQUEST_SUBMITTED: '提交固定申请',
  FIXED_APPOINTMENT_REQUEST_WITHDRAWN: '撤回固定申请',
  FIXED_APPOINTMENT_RESTORED_AFTER_LEAVE_CANCEL: '取消请假并恢复固定排班',
  HOST_CREATED: '新增主播',
  HOST_DELETED: '删除主播',
  HOST_OPERATOR_ASSIGNED: '分配主播运营',
  HOST_OPERATOR_ENDED: '结束主播运营关系',
  HOST_RESTORED: '恢复已删除主播',
  HOST_UPDATED: '修改主播',
  INITIAL_ADMIN_CREATED: '创建初始管理员',
  INITIAL_IMPORT_SUCCEEDED: '完成初始名单导入',
  INITIAL_PASSWORD_CHANGED: '修改初始密码',
  INITIAL_PROFILE_ACCOUNTS_PROVISIONED: '批量生成业务账号',
  LEAVE_CANCELLED: '取消请假',
  LEAVE_CREATED: '提交请假',
  OPERATOR_CREATED: '新增运营',
  OPERATOR_DELETED: '删除运营',
  OPERATOR_UPDATED: '修改运营',
  PASSWORD_CHANGED: '修改密码',
  SCHEDULE_EXPORT_FAILED: '排班导出失败',
  SCHEDULE_EXPORT_FILE_DELETED: '删除过期排班文件',
  SCHEDULE_EXPORT_REQUESTED: '申请导出排班',
  SCHEDULE_EXPORT_SUCCEEDED: '排班导出完成',
  SITE_CREATED: '新增场地',
  SITE_UPDATED: '修改场地',
  WEB_ACCOUNT_PASSWORD_RESET: '重置网页账号密码',
  WEB_PROFILE_ACCOUNT_PROVISIONED: '生成网页账号',
};

export const AUDIT_OBJECT_LABELS: Readonly<Record<string, string>> = {
  APP_USER: '账号',
  APPOINTMENT: '预约',
  ARTIST: '化妆师',
  ARTIST_OVERTIME: '加班申请',
  ARTIST_SHIFT_CHANGE_REQUEST: '班次修改申请',
  ARTIST_SHIFT_TEMPLATE: '化妆师班次',
  ARTIST_UNAVAILABLE_PERIOD: '临时不可排班',
  EXPORT_JOB: '排班导出',
  FIXED_APPOINTMENT_REQUEST: '固定申请',
  HOST: '主播',
  HOST_OPERATOR_RELATION: '主播运营关系',
  IMPORT_BATCH: '名单导入',
  LEAVE_RECORD: '请假记录',
  OPERATOR: '运营',
  PROFILE_ACCOUNTS: '业务账号',
  SITE: '场地',
  USER_ROLE: '账号角色',
};

const ROLE_LABELS: Readonly<Record<string, string>> = {
  ADMIN: '管理员',
  ARTIST: '化妆师',
  CUSTOMER_SERVICE: '客服',
  HOST: '主播',
  OPERATOR: '运营',
  SYSTEM: '系统',
};

export function approvalStatusLabel(status: string): string {
  return APPROVAL_STATUS_LABELS[status as keyof typeof APPROVAL_STATUS_LABELS] ?? '状态未知';
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? '其他系统操作';
}

export function auditObjectLabel(objectType: string): string {
  return AUDIT_OBJECT_LABELS[objectType] ?? '其他业务数据';
}

export function roleLabel(roleCode: string): string {
  return ROLE_LABELS[roleCode] ?? '系统人员';
}
