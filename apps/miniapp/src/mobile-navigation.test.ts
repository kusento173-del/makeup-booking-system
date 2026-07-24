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
    expect(getAllowedFeature('ARTIST', 'unavailability')?.title).toBe('临时不可排班');
  });

  it('生成稳定的小程序业务入口地址', () => {
    expect(featureRoute('schedule', 'HOST')).toBe('/pages/schedule/index');
    expect(featureRoute('booking', 'HOST')).toBe('/pages/booking/index');
    expect(featureRoute('booking', 'OPERATOR')).toBe('/pages/booking/index');
    expect(featureRoute('shift', 'ARTIST')).toBe('/pages/shift/index');
    expect(featureRoute('leave', 'ARTIST')).toBe('/pages/leave/index');
    expect(featureRoute('leave', 'HOST')).toBe('/pages/leave/index');
    expect(featureRoute('overtime', 'ARTIST')).toBe('/pages/overtime/index');
    expect(featureRoute('unavailability', 'ARTIST')).toBe('/pages/unavailability/index');
  });
});
