import type { BackofficeRoleCode } from './auth-session';
import type { ManagementView } from './master-data-api';

export type BackofficeView = 'schedule' | ManagementView;

const NAV_ITEMS: readonly {
  readonly adminOnly?: boolean;
  readonly id: BackofficeView;
  readonly label: string;
}[] = [
  { id: 'schedule', label: '排班看板' },
  { id: 'hosts', label: '主播' },
  { id: 'artists', label: '化妆师' },
  { id: 'operators', label: '运营' },
  { id: 'relations', label: '主播—运营关系' },
  { id: 'sites', label: '场地' },
  { adminOnly: true, id: 'accounts', label: '账号与角色' },
];

interface BackofficeNavigationProps {
  readonly onSelect: (view: BackofficeView) => void;
  readonly roleCode: BackofficeRoleCode;
  readonly view: BackofficeView;
}

export function BackofficeNavigation({ onSelect, roleCode, view }: BackofficeNavigationProps) {
  return (
    <aside className="sidebar" aria-label="管理菜单">
      <div className="sidebar-brand">妆序</div>
      <nav>
        {NAV_ITEMS.filter((item) => !item.adminOnly || roleCode === 'ADMIN').map((item) => (
          <button
            aria-current={item.id === view ? 'page' : undefined}
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
