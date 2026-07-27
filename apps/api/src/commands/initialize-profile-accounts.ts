import { randomUUID } from 'node:crypto';

import { createDatabaseClient, Prisma } from '@makeup/database';

import { normalizeBackofficeLoginName } from '../auth/backoffice-login-name';
import { PasswordHasherService } from '../auth/password-hasher.service';

type ProfileRoleCode = 'ARTIST' | 'HOST' | 'OPERATOR';

interface CommandOptions {
  actorUserId: string | null;
  confirm: boolean;
  expectedDatabase: string | null;
}

interface ProfileAccountPlan {
  displayName: string;
  loginName: string;
  profileId: string;
  roleCode: ProfileRoleCode;
  siteId: string;
  userId: string;
}

function parseOptions(argv: readonly string[]): CommandOptions {
  const valueOf = (name: string) =>
    argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
  return {
    actorUserId: valueOf('--actor-user-id'),
    confirm: argv.includes('--confirm'),
    expectedDatabase: valueOf('--expected-database'),
  };
}

function databaseName(connectionString: string): string {
  const name = new URL(connectionString).pathname.replace(/^\/+/, '');
  if (!name) throw new Error('DATABASE_URL must include a database name');
  return name;
}

function generatedLoginName(prefix: 'ma' | 'op', index: number): string {
  return `${prefix}${String(index + 1).padStart(4, '0')}`;
}

async function buildPlan(client: ReturnType<typeof createDatabaseClient>): Promise<{
  boundProfiles: number;
  conflictingLoginNames: number;
  plans: ProfileAccountPlan[];
  totals: Record<ProfileRoleCode, number>;
}> {
  const [hosts, artists, operators] = await Promise.all([
    client.hostProfile.findMany({
      orderBy: [{ site: { code: 'asc' } }, { hostCode: 'asc' }, { id: 'asc' }],
      select: { hostCode: true, id: true, realName: true, siteId: true, userId: true },
    }),
    client.artistProfile.findMany({
      orderBy: [{ site: { code: 'asc' } }, { nicknameNormalized: 'asc' }, { id: 'asc' }],
      select: { id: true, nickname: true, siteId: true, userId: true },
    }),
    client.operatorProfile.findMany({
      orderBy: [{ site: { code: 'asc' } }, { nameNormalized: 'asc' }, { id: 'asc' }],
      select: { id: true, realName: true, siteId: true, userId: true },
    }),
  ]);

  const plans: ProfileAccountPlan[] = [
    ...hosts.map((profile) => {
      const loginName = normalizeBackofficeLoginName(profile.hostCode);
      if (!loginName) throw new Error('A host code cannot be used as a login name');
      return {
        displayName: profile.realName,
        loginName,
        profileId: profile.id,
        roleCode: 'HOST' as const,
        siteId: profile.siteId,
        userId: randomUUID(),
      };
    }),
    ...artists.map((profile, index) => ({
      displayName: profile.nickname,
      loginName: generatedLoginName('ma', index),
      profileId: profile.id,
      roleCode: 'ARTIST' as const,
      siteId: profile.siteId,
      userId: randomUUID(),
    })),
    ...operators.map((profile, index) => ({
      displayName: profile.realName,
      loginName: generatedLoginName('op', index),
      profileId: profile.id,
      roleCode: 'OPERATOR' as const,
      siteId: profile.siteId,
      userId: randomUUID(),
    })),
  ];
  const loginNames = plans.map((plan) => plan.loginName);
  if (new Set(loginNames).size !== loginNames.length) {
    throw new Error('Generated profile login names are not unique');
  }

  const conflictingLoginNames = await client.userIdentity.count({
    where: {
      externalSubject: { in: loginNames },
      provider: 'PASSWORD',
      providerAppId: 'BACKOFFICE',
    },
  });

  return {
    boundProfiles: [...hosts, ...artists, ...operators].filter((profile) => profile.userId).length,
    conflictingLoginNames,
    plans,
    totals: {
      ARTIST: artists.length,
      HOST: hosts.length,
      OPERATOR: operators.length,
    },
  };
}

async function hashPasswords(
  plans: readonly ProfileAccountPlan[],
  temporaryPassword: string,
): Promise<Map<string, string>> {
  const hasher = new PasswordHasherService();
  hasher.assertPassword(temporaryPassword);
  const result = new Map<string, string>();
  const concurrency = 6;
  for (let index = 0; index < plans.length; index += concurrency) {
    const batch = plans.slice(index, index + concurrency);
    const hashes = await Promise.all(batch.map(() => hasher.hash(temporaryPassword)));
    batch.forEach((plan, offset) => {
      const passwordHash = hashes[offset];
      if (!passwordHash) throw new Error('A password hash is missing');
      result.set(plan.userId, passwordHash);
    });
  }
  return result;
}

function requiredHash(hashes: ReadonlyMap<string, string>, userId: string): string {
  const hash = hashes.get(userId);
  if (!hash) throw new Error('A password hash is missing');
  return hash;
}

async function linkProfiles(
  transaction: Prisma.TransactionClient,
  tableName: 'artist_profiles' | 'host_profiles' | 'operator_profiles',
  plans: readonly ProfileAccountPlan[],
): Promise<number> {
  if (plans.length === 0) return 0;
  let linked = 0;
  for (let index = 0; index < plans.length; index += 500) {
    const values = Prisma.join(
      plans
        .slice(index, index + 500)
        .map((plan) => Prisma.sql`(${plan.profileId}::uuid, ${plan.userId}::uuid)`),
    );
    const query =
      tableName === 'host_profiles'
        ? Prisma.sql`
            UPDATE "host_profiles" AS profile
            SET "user_id" = mapping.user_id,
                "row_version" = profile."row_version" + 1,
                "updated_at" = now()
            FROM (VALUES ${values}) AS mapping(profile_id, user_id)
            WHERE profile."id" = mapping.profile_id
              AND profile."user_id" IS NULL
          `
        : tableName === 'artist_profiles'
          ? Prisma.sql`
              UPDATE "artist_profiles" AS profile
              SET "user_id" = mapping.user_id,
                  "row_version" = profile."row_version" + 1,
                  "updated_at" = now()
              FROM (VALUES ${values}) AS mapping(profile_id, user_id)
              WHERE profile."id" = mapping.profile_id
                AND profile."user_id" IS NULL
            `
          : Prisma.sql`
              UPDATE "operator_profiles" AS profile
              SET "user_id" = mapping.user_id,
                  "row_version" = profile."row_version" + 1,
                  "updated_at" = now()
              FROM (VALUES ${values}) AS mapping(profile_id, user_id)
              WHERE profile."id" = mapping.profile_id
                AND profile."user_id" IS NULL
            `;
    linked += await transaction.$executeRaw(query);
  }
  return linked;
}

async function initializeAccounts(
  connectionString: string,
  actorUserId: string,
  plan: Awaited<ReturnType<typeof buildPlan>>,
  passwordHashes: ReadonlyMap<string, string>,
): Promise<void> {
  const client = createDatabaseClient(connectionString);
  try {
    await client.$transaction(
      async (transaction) => {
        const actor = await transaction.appUser.findFirst({
          where: {
            id: actorUserId,
            status: 'ACTIVE',
            roles: { some: { roleCode: 'ADMIN', revokedAt: null } },
          },
          select: { displayName: true, id: true },
        });
        if (!actor) throw new Error('The account initialization actor must be an active ADMIN');

        const hosts = await transaction.hostProfile.count();
        const artists = await transaction.artistProfile.count();
        const operators = await transaction.operatorProfile.count();
        const boundProfiles =
          (await transaction.hostProfile.count({ where: { userId: { not: null } } })) +
          (await transaction.artistProfile.count({ where: { userId: { not: null } } })) +
          (await transaction.operatorProfile.count({ where: { userId: { not: null } } }));
        const conflictingLoginNames = await transaction.userIdentity.count({
          where: {
            externalSubject: { in: plan.plans.map((account) => account.loginName) },
            provider: 'PASSWORD',
            providerAppId: 'BACKOFFICE',
          },
        });
        if (
          hosts !== plan.totals.HOST ||
          artists !== plan.totals.ARTIST ||
          operators !== plan.totals.OPERATOR ||
          boundProfiles !== 0 ||
          conflictingLoginNames !== 0
        ) {
          throw new Error('Profile data changed after account initialization preflight');
        }

        await transaction.appUser.createMany({
          data: plan.plans.map((account) => ({
            displayName: account.displayName,
            id: account.userId,
            status: 'ACTIVE',
          })),
        });
        await transaction.userIdentity.createMany({
          data: plan.plans.map((account) => ({
            externalSubject: account.loginName,
            provider: 'PASSWORD',
            providerAppId: 'BACKOFFICE',
            userId: account.userId,
          })),
        });
        await transaction.passwordCredential.createMany({
          data: plan.plans.map((account) => ({
            mustChangePassword: true,
            passwordHash: requiredHash(passwordHashes, account.userId),
            userId: account.userId,
          })),
        });
        await transaction.userRole.createMany({
          data: plan.plans.map((account) => ({
            assignedByUserId: actor.id,
            roleCode: account.roleCode,
            siteId: account.siteId,
            userId: account.userId,
          })),
        });

        const linked = [
          await linkProfiles(
            transaction,
            'host_profiles',
            plan.plans.filter((account) => account.roleCode === 'HOST'),
          ),
          await linkProfiles(
            transaction,
            'artist_profiles',
            plan.plans.filter((account) => account.roleCode === 'ARTIST'),
          ),
          await linkProfiles(
            transaction,
            'operator_profiles',
            plan.plans.filter((account) => account.roleCode === 'OPERATOR'),
          ),
        ];
        if (linked.reduce((total, count) => total + count, 0) !== plan.plans.length) {
          throw new Error('Not every profile was linked to its initialized account');
        }

        await transaction.operationLog.create({
          data: {
            action: 'INITIAL_PROFILE_ACCOUNTS_PROVISIONED',
            actorNameSnapshot: actor.displayName,
            actorRole: 'ADMIN',
            actorUserId: actor.id,
            afterData: {
              artists: plan.totals.ARTIST,
              hosts: plan.totals.HOST,
              mustChangePassword: true,
              operators: plan.totals.OPERATOR,
              total: plan.plans.length,
            },
            clientType: 'CLI',
            objectId: randomUUID(),
            objectType: 'PROFILE_ACCOUNTS',
            reason: '首次人员账号初始化',
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 },
    );
  } finally {
    await client.$disconnect();
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const currentDatabase = databaseName(connectionString);
  const client = createDatabaseClient(connectionString);
  const plan = await buildPlan(client).finally(() => client.$disconnect());
  console.log(
    JSON.stringify(
      {
        boundProfiles: plan.boundProfiles,
        conflictingLoginNames: plan.conflictingLoginNames,
        generatedAccounts: plan.plans.length,
        totals: plan.totals,
      },
      null,
      2,
    ),
  );
  if (!options.confirm) return;

  if (!options.expectedDatabase || options.expectedDatabase !== currentDatabase) {
    throw new Error('--expected-database must exactly match the DATABASE_URL database name');
  }
  if (!options.actorUserId) throw new Error('--actor-user-id is required with --confirm');
  const actorClient = createDatabaseClient(connectionString);
  const actor = await actorClient.appUser
    .findFirst({
      where: {
        id: options.actorUserId,
        status: 'ACTIVE',
        roles: { some: { roleCode: 'ADMIN', revokedAt: null } },
      },
      select: { id: true },
    })
    .finally(() => actorClient.$disconnect());
  if (!actor) throw new Error('The account initialization actor must be an active ADMIN');
  if (plan.plans.length === 0)
    throw new Error('No profiles are available for account initialization');
  if (plan.boundProfiles !== 0 || plan.conflictingLoginNames !== 0) {
    throw new Error(
      'Initial account creation requires all profiles to be unbound and login names free',
    );
  }
  const temporaryPassword = process.env.INITIAL_PROFILE_PASSWORD;
  if (!temporaryPassword) throw new Error('INITIAL_PROFILE_PASSWORD is required with --confirm');
  const passwordHashes = await hashPasswords(plan.plans, temporaryPassword);
  await initializeAccounts(connectionString, options.actorUserId, plan, passwordHashes);
  console.log(`Initial profile accounts succeeded in database ${currentDatabase}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Profile account initialization failed');
  process.exitCode = 1;
});
