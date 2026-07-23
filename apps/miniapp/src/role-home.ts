import type { RoleCode } from './auth-session';

export type MobileRoleCode = Extract<RoleCode, 'ARTIST' | 'HOST' | 'OPERATOR'>;

export interface MobileRoleHome {
  readonly description: string;
  readonly roleLabel: string;
  readonly scheduleLabel: string;
  readonly title: string;
}

const MOBILE_ROLE_HOMES: Readonly<Record<MobileRoleCode, MobileRoleHome>> = {
  ARTIST: {
    description: '查看你的化妆安排和空闲情况',
    roleLabel: '化妆师',
    scheduleLabel: '查看我的排班',
    title: '我的工作台',
  },
  HOST: {
    description: '查看自己的化妆时间和实际预约化妆师',
    roleLabel: '主播',
    scheduleLabel: '查看我的排班',
    title: '我的化妆安排',
  },
  OPERATOR: {
    description: '查看当前由你负责主播的化妆安排',
    roleLabel: '运营',
    scheduleLabel: '查看负责主播排班',
    title: '主播化妆安排',
  },
};

export function getMobileRoleHome(roleCode: RoleCode): MobileRoleHome | null {
  return roleCode in MOBILE_ROLE_HOMES ? MOBILE_ROLE_HOMES[roleCode as MobileRoleCode] : null;
}
