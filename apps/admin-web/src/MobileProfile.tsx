import { useEffect, useState } from 'react';

import type { CurrentProfile, SessionTokenPair } from './auth-session';
import { getCurrentProfile } from './auth-session';

const ROLE_LABELS = {
  ARTIST: '化妆师',
  HOST: '主播',
  OPERATOR: '运营',
} as const;

export function MobileProfile({ session }: { readonly session: SessionTokenPair }) {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void getCurrentProfile(session.accessToken)
      .then(setProfile)
      .catch(() => setError('个人信息加载失败，请稍后重试'));
  }, [session.accessToken]);

  return (
    <section className="mobile-view">
      <div className="mobile-section-header">
        <div>
          <p className="eyebrow">账号资料</p>
          <h1>个人信息</h1>
        </div>
      </div>
      {error ? <p className="error-banner">{error}</p> : null}
      {!profile && !error ? <p className="empty-state">正在加载个人信息…</p> : null}
      {profile ? (
        <dl className="mobile-profile-card">
          <div>
            <dt>姓名</dt>
            <dd>{profile.personName}</dd>
          </div>
          <div>
            <dt>身份</dt>
            <dd>{ROLE_LABELS[profile.roleCode as keyof typeof ROLE_LABELS] ?? '工作人员'}</dd>
          </div>
          <div>
            <dt>场地</dt>
            <dd>{profile.siteName ?? '全部场地'}</dd>
          </div>
          <div>
            <dt>登录账号</dt>
            <dd>{profile.account || '尚未设置'}</dd>
          </div>
          {profile.roleCode === 'HOST' ? (
            <div>
              <dt>主播编号</dt>
              <dd>{profile.hostCode ?? profile.account}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
