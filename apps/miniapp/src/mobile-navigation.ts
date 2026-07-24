import type { RoleCode } from './auth-session';

export type MobileRoleCode = Extract<RoleCode, 'ARTIST' | 'HOST' | 'OPERATOR'>;
export type MobileFeatureId =
  | 'booking'
  | 'fixed'
  | 'fixed-relations'
  | 'leave'
  | 'managed-hosts'
  | 'overtime'
  | 'schedule'
  | 'shift'
  | 'unavailability';

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
      { description: '查看当前固定化妆师和固定时间', id: 'fixed-relations', title: '固定化妆师' },
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
      { description: '查看当前固定主播名单和固定时间', id: 'fixed-relations', title: '固定主播' },
      { description: '设置、查看和申请修改固定班次', id: 'shift', title: '班次' },
      { description: '申请未来七日内请假', id: 'leave', title: '请假' },
      {
        description: '设置上课、开会等局部不可预约时间',
        id: 'unavailability',
        title: '临时不可排班',
      },
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

export function featureRoute(featureId: MobileFeatureId, roleCode?: RoleCode): string {
  if (featureId === 'schedule') return '/pages/schedule/index';
  if (featureId === 'shift' && roleCode === 'ARTIST') return '/pages/shift/index';
  if (featureId === 'leave' && (roleCode === 'HOST' || roleCode === 'ARTIST')) {
    return '/pages/leave/index';
  }
  if (featureId === 'overtime' && roleCode === 'ARTIST') return '/pages/overtime/index';
  if (featureId === 'unavailability' && roleCode === 'ARTIST') {
    return '/pages/unavailability/index';
  }
  if (featureId === 'booking' && (roleCode === 'HOST' || roleCode === 'OPERATOR')) {
    return '/pages/booking/index';
  }
  if (featureId === 'managed-hosts' && roleCode === 'OPERATOR') {
    return '/pages/managed-hosts/index';
  }
  if (featureId === 'fixed-relations' && (roleCode === 'HOST' || roleCode === 'ARTIST')) {
    return '/pages/fixed-relations/index';
  }
  if (featureId === 'fixed' && roleCode === 'OPERATOR') return '/pages/fixed/index';
  return `/pages/feature/index?feature=${featureId}`;
}
