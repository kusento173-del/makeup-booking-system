import { useState } from 'react';

import type { BackofficeRoleCode } from './auth-session';
import type { ManagementView } from './master-data-api';

export type BackofficeView =
  | 'approvals'
  | 'audit'
  | 'exports'
  | 'fixed-approvals'
  | 'fixed-rules'
  | 'overtime-approvals'
  | 'schedule'
  | ManagementView;

const NAV_GROUPS: readonly {
  readonly id: string;
  readonly label: string;
  readonly items: readonly {
    readonly adminOnly?: boolean;
    readonly id: BackofficeView;
    readonly label: string;
  }[];
}[] = [
  {
    id: 'scheduling',
    items: [
      { id: 'schedule', label: '排班看板' },
      { id: 'fixed-rules', label: '固定主播名单' },
      { id: 'exports', label: '排班导出' },
    ],
    label: '排班管理',
  },
  {
    id: 'approvals',
    items: [
      { id: 'fixed-approvals', label: '固定申请审批' },
      { id: 'approvals', label: '班次审批' },
      { id: 'overtime-approvals', label: '加班审批' },
    ],
    label: '审批管理',
  },
  {
    id: 'people',
    items: [
      { id: 'hosts', label: '主播' },
      { id: 'artists', label: '化妆师' },
      { id: 'operators', label: '运营' },
      { id: 'relations', label: '主播—运营关系' },
    ],
    label: '人员管理',
  },
  {
    id: 'system',
    items: [
      { id: 'sites', label: '场地' },
      { adminOnly: true, id: 'accounts', label: '账号与角色' },
      { id: 'audit', label: '操作记录' },
    ],
    label: '系统设置',
  },
];

interface BackofficeNavigationProps {
  readonly onSelect: (view: BackofficeView) => void;
  readonly roleCode: BackofficeRoleCode;
  readonly view: BackofficeView;
}

export function BackofficeNavigation({ onSelect, roleCode, view }: BackofficeNavigationProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());

  function toggleGroup(groupId: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <aside className="sidebar" aria-label="管理菜单">
      <div className="sidebar-brand">妆序</div>
      <nav>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.adminOnly || roleCode === 'ADMIN');
          if (items.length === 0) return null;
          const collapsed = collapsedGroups.has(group.id);
          return (
            <section aria-labelledby={`nav-${group.id}-label`} className="nav-group" key={group.id}>
              <button
                aria-controls={`nav-${group.id}-items`}
                aria-expanded={!collapsed}
                aria-label={`${collapsed ? '展开' : '收起'}${group.label}`}
                className="nav-group-toggle"
                onClick={() => toggleGroup(group.id)}
                type="button"
              >
                <span id={`nav-${group.id}-label`}>{group.label}</span>
                <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
              </button>
              <div className="nav-group-items" hidden={collapsed} id={`nav-${group.id}-items`}>
                {items.map((item) => (
                  <button
                    aria-current={item.id === view ? 'page' : undefined}
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </nav>
    </aside>
  );
}
