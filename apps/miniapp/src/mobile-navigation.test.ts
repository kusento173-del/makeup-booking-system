import { describe, expect, it } from 'vitest';

import { featureRoute, getAllowedFeature, getMobileHome } from './mobile-navigation';

describe('mobile navigation', () => {
  it('只为三类移动角色建立业务首页', () => {
    expect(getMobileHome('HOST')?.roleLabel).toBe('主播');
    expect(getMobileHome('OPERATOR')?.roleLabel).toBe('运营');
    expect(getMobileHome('ARTIST')?.roleLabel).toBe('化妆师');
    expect(getMobileHome('CUSTOMER_SERVICE')).toBeNull();
    expect(getMobileHome('ADMIN')).toBeNull();
  });

  it('阻止角色打开未授权入口', () => {
    expect(getAllowedFeature('HOST', 'booking')?.title).toBe('预约化妆');
    expect(getAllowedFeature('HOST', 'fixed')).toBeNull();
    expect(getAllowedFeature('OPERATOR', 'fixed')?.title).toBe('固定申请');
    expect(getAllowedFeature('ARTIST', 'overtime')?.title).toBe('加班');
  });

  it('生成稳定的小程序业务入口地址', () => {
    expect(featureRoute('schedule')).toBe('/pages/feature/index?feature=schedule');
  });
});
