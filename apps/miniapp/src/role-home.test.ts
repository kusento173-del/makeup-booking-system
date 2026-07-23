import { describe, expect, it } from 'vitest';

import { getMobileRoleHome } from './role-home';

describe('mobile role home', () => {
  it.each([
    ['HOST', '查看我的排班'],
    ['OPERATOR', '查看负责主播排班'],
    ['ARTIST', '查看我的排班'],
  ] as const)('为 %s 返回对应的排班入口', (roleCode, scheduleLabel) => {
    expect(getMobileRoleHome(roleCode)?.scheduleLabel).toBe(scheduleLabel);
  });

  it('不为后台角色暴露小程序业务入口', () => {
    expect(getMobileRoleHome('ADMIN')).toBeNull();
    expect(getMobileRoleHome('CUSTOMER_SERVICE')).toBeNull();
  });
});
