import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type { VerifiedAuthorizationContext } from './authorization.types';
import type { CurrentProfile } from './current-profile.types';

@Injectable()
export class CurrentProfileService {
  constructor(private readonly database: DatabaseService) {}

  async get(context: VerifiedAuthorizationContext): Promise<CurrentProfile> {
    const user = await this.database.read((client) =>
      client.appUser.findUniqueOrThrow({
        select: {
          artistProfile: {
            select: { nickname: true, realName: true, site: { select: { id: true, name: true } } },
          },
          displayName: true,
          hostProfile: {
            select: {
              hostCode: true,
              nickname: true,
              realName: true,
              site: { select: { id: true, name: true } },
            },
          },
          identities: {
            select: { externalSubject: true },
            take: 1,
            where: { provider: 'PASSWORD', providerAppId: 'BACKOFFICE', status: 'ACTIVE' },
          },
          operatorProfile: {
            select: { realName: true, site: { select: { id: true, name: true } } },
          },
        },
        where: { id: context.userId },
      }),
    );

    const profile =
      context.roleCode === 'HOST'
        ? user.hostProfile
        : context.roleCode === 'ARTIST'
          ? user.artistProfile
          : context.roleCode === 'OPERATOR'
            ? user.operatorProfile
            : null;
    const personName =
      context.roleCode === 'HOST'
        ? (user.hostProfile?.nickname ?? user.hostProfile?.realName)
        : context.roleCode === 'ARTIST'
          ? (user.artistProfile?.nickname ?? user.artistProfile?.realName)
          : context.roleCode === 'OPERATOR'
            ? user.operatorProfile?.realName
            : user.displayName;

    return {
      account: user.identities[0]?.externalSubject ?? '',
      displayName: user.displayName,
      hostCode: user.hostProfile?.hostCode ?? null,
      personName: personName ?? user.displayName,
      roleCode: context.roleCode,
      siteId: profile?.site.id ?? context.siteId,
      siteName: profile?.site.name ?? null,
    };
  }
}
