import type { BackofficeRoleCode } from './auth-session';
import type { ManagementView } from './master-data-api';

export type BackofficeView =
  | 'approvals'
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
    ],
    label: '系统设置',
  },
];

interface BackofficeNavigationProps {
  readonly collapsed: boolean;
  readonly onSelect: (view: BackofficeView) => void;
  readonly onToggle: () => void;
  readonly roleCode: BackofficeRoleCode;
  readonly view: BackofficeView;
}

export function BackofficeNavigation({
  collapsed,
  onSelect,
  onToggle,
  roleCode,
  view,
}: BackofficeNavigationProps) {
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-label="管理菜单">
      <div className="sidebar-header">
        {collapsed ? null : <div className="sidebar-brand">妆序</div>}
        <button
          aria-controls="backoffice-navigation"
          aria-expanded={!collapsed}
          aria-label={collapsed ? '展开菜单' : '收起菜单'}
          className="sidebar-toggle"
          onClick={onToggle}
          title={collapsed ? '展开菜单' : '收起菜单'}
          type="button"
        >
          {collapsed ? '展开' : '收起'}
        </button>
      </div>
      <nav hidden={collapsed} id="backoffice-navigation">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.adminOnly || roleCode === 'ADMIN');
          if (items.length === 0) return null;
          return (
            <section aria-labelledby={`nav-${group.id}`} className="nav-group" key={group.id}>
              <p className="nav-group-label" id={`nav-${group.id}`}>
                {group.label}
              </p>
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
            </section>
          );
        })}
      </nav>
    </aside>
  );
}
