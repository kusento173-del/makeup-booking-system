import type { RoleCode } from './auth-session';

export type MobileRoleCode = Extract<RoleCode, 'ARTIST' | 'HOST' | 'OPERATOR'>;
export type MobileFeatureId =
  'booking' | 'fixed' | 'leave' | 'managed-hosts' | 'overtime' | 'schedule' | 'shift';

export interface MobileFeature {
  readonly description: string;
  readonly id: MobileFeatureId;
  readonly title: string;
}

export interface MobileHome {
  readonly description: string;
  readonly features: readonly MobileFeature[];
  readonly roleLabel: string;
  readonly title: string;
}

const HOME_BY_ROLE: Readonly<Record<MobileRoleCode, MobileHome>> = {
  HOST: {
    description: '查看本人排班，预约或调整未来七日化妆安排。',
    features: [
      { description: '今日、明日、未来七日和历史记录', id: 'schedule', title: '我的排班' },
      { description: '选择日期、化妆师和空闲时间', id: 'booking', title: '预约化妆' },
      { description: '固定主播可申请未来七日内请假', id: 'leave', title: '请假' },
    ],
    roleLabel: '主播',
    title: '我的化妆安排',
  },
  OPERATOR: {
    description: '管理当前负责主播的预约和固定申请。',
    features: [
      { description: '按有效负责关系查看主播', id: 'managed-hosts', title: '负责主播' },
      { description: '在负责范围内代主播预约', id: 'booking', title: '代主播预约' },
      { description: '新建、变更和取消固定关系', id: 'fixed', title: '固定申请' },
    ],
    roleLabel: '运营',
    title: '主播化妆安排',
  },
  ARTIST: {
    description: '查看个人排班，管理班次、请假和加班申请。',
    features: [
      { description: '今日、明日、未来七日和历史记录', id: 'schedule', title: '我的排班' },
      { description: '首次设置和查看当前固定班次', id: 'shift', title: '班次' },
      { description: '申请未来七日内请假', id: 'leave', title: '请假' },
      { description: '为常规非工作日提交加班申请', id: 'overtime', title: '加班' },
    ],
    roleLabel: '化妆师',
    title: '我的工作安排',
  },
};

export function getMobileHome(roleCode: RoleCode): MobileHome | null {
  return roleCode === 'HOST' || roleCode === 'OPERATOR' || roleCode === 'ARTIST'
    ? HOME_BY_ROLE[roleCode]
    : null;
}

export function getAllowedFeature(
  roleCode: RoleCode,
  featureId: string | undefined,
): MobileFeature | null {
  if (!featureId) return null;
  return getMobileHome(roleCode)?.features.find((feature) => feature.id === featureId) ?? null;
}

export function featureRoute(featureId: MobileFeatureId): string {
  return featureId === 'schedule'
    ? '/pages/schedule/index'
    : `/pages/feature/index?feature=${featureId}`;
}
