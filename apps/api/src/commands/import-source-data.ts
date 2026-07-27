import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

import { createDatabaseClient, Prisma } from '@makeup/database';

import {
  loadSourceImportPlan,
  SourceDataValidationError,
  type SourceFile,
  type SourceImportPlan,
} from './source-import-plan';

interface CommandOptions {
  actorUserId: string | null;
  confirm: boolean;
  effectiveDate: string | null;
  expectedDatabase: string | null;
  sourceDir: string;
}

const SITE_CODES: Record<string, string> = {
  松江: 'SONGJIANG',
  现厂: 'XIANCHANG',
  无锡: 'WUXI',
};

function parseOptions(argv: readonly string[]): CommandOptions {
  const valueOf = (name: string) =>
    argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
  return {
    actorUserId: valueOf('--actor-user-id'),
    confirm: argv.includes('--confirm'),
    effectiveDate: valueOf('--effective-date'),
    expectedDatabase: valueOf('--expected-database'),
    sourceDir: path.resolve(valueOf('--source-dir') ?? 'data/source'),
  };
}

function databaseName(connectionString: string): string {
  const name = new URL(connectionString).pathname.replace(/^\/+/, '');
  if (!name) throw new Error('DATABASE_URL must include a database name');
  return name;
}

function effectiveDate(value: string | null): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('--effective-date must use YYYY-MM-DD');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) throw new Error('--effective-date is invalid');
  return parsed;
}

function mustGet<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error('Validated source mapping is incomplete');
  return value;
}

function publicSummary(plan: SourceImportPlan) {
  return {
    ...plan.summary,
    fixedReferenceRowsIgnored: plan.fixedReferenceRowCount,
    fileHashes: Object.fromEntries(
      Object.entries(plan.files).map(([key, file]) => [key, file.sha256]),
    ),
  };
}

function batchInput(
  id: string,
  importType: string,
  file: SourceFile,
  actorUserId: string,
  now: Date,
  summary: Prisma.InputJsonValue,
) {
  return {
    id,
    importType,
    templateVersion: 'LEGACY-1',
    mode: 'SNAPSHOT',
    originalFilename: file.fileName,
    fileSha256: file.sha256.toLowerCase(),
    storageKey: `private-source/${file.sha256.toLowerCase()}.xlsx`,
    status: 'SUCCEEDED',
    uploadedByUserId: actorUserId,
    confirmedByUserId: actorUserId,
    confirmedAt: now,
    summary,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

async function applyInitialImport(
  plan: SourceImportPlan,
  connectionString: string,
  actorUserId: string,
  validFrom: Date,
): Promise<void> {
  const client = createDatabaseClient(connectionString);
  try {
    const actor = await client.appUser.findFirst({
      where: {
        id: actorUserId,
        status: 'ACTIVE',
        roles: { some: { roleCode: 'ADMIN', revokedAt: null } },
      },
      select: { displayName: true, id: true },
    });
    if (!actor) throw new Error('The import actor must be an active ADMIN');

    const existing = await Promise.all([
      client.hostProfile.count(),
      client.artistProfile.count(),
      client.operatorProfile.count(),
      client.hostOperatorRelation.count(),
      client.importBatch.count(),
    ]);
    if (existing.some((count) => count > 0)) {
      throw new Error('Initial import requires an empty target business database');
    }

    const existingSites = await client.site.findMany({
      where: { name: { in: Object.keys(SITE_CODES) } },
      select: { code: true, id: true, name: true },
    });
    for (const site of existingSites) {
      if (SITE_CODES[site.name] !== site.code) {
        throw new Error('Existing site code does not match the import definition');
      }
    }

    const now = new Date();
    const batchIds = {
      hosts: randomUUID(),
      artists: randomUUID(),
      operators: randomUUID(),
      relations: randomUUID(),
    };
    const siteIds = new Map(existingSites.map((site) => [site.name, site.id]));
    for (const name of Object.keys(SITE_CODES)) {
      if (!siteIds.has(name)) siteIds.set(name, randomUUID());
    }
    const hostIds = new Map(plan.hosts.map((host) => [host.hostCode, randomUUID()]));
    const artistIds = new Map(plan.artists.map((artist) => [artist.nickname, randomUUID()]));
    const operatorIds = new Map(
      plan.operators.map((operator) => [operator.realName, randomUUID()]),
    );
    const relationIds = new Map(
      plan.relations
        .filter((relation) => relation.resolvedOperator)
        .map((relation) => [relation.rowNumber, randomUUID()]),
    );

    await client.$transaction(
      async (transaction) => {
        await transaction.site.createMany({
          data: Object.entries(SITE_CODES).flatMap(([name, code], index) => {
            if (existingSites.some((site) => site.name === name)) return [];
            return [{ id: mustGet(siteIds, name), code, name, sortOrder: index + 1 }];
          }),
        });
        await transaction.importBatch.createMany({
          data: [
            batchInput(batchIds.hosts, 'HOST', plan.files.hosts, actor.id, now, {
              total: plan.hosts.length,
              created: plan.hosts.length,
            }),
            batchInput(batchIds.artists, 'ARTIST', plan.files.artists, actor.id, now, {
              total: plan.artists.length,
              created: plan.artists.length,
            }),
            batchInput(batchIds.operators, 'OPERATOR', plan.files.operators, actor.id, now, {
              total: plan.operators.length,
              created: plan.operators.length,
            }),
            batchInput(
              batchIds.relations,
              'HOST_OPERATOR_RELATION',
              plan.files.relations,
              actor.id,
              now,
              {
                total: plan.relations.length,
                created: plan.summary.resolvedRelations,
                unassigned: plan.summary.unassignedRelations,
                hostsWithoutRelationRow: plan.summary.hostsWithoutRelationRow,
              },
            ),
          ],
        });

        await transaction.hostProfile.createMany({
          data: plan.hosts.map((host) => ({
            id: mustGet(hostIds, host.hostCode),
            hostCode: host.hostCode,
            realName: host.realName,
            siteId: mustGet(siteIds, host.siteName),
            qualificationEffectiveAt: now,
            sourceImportBatchId: batchIds.hosts,
          })),
        });
        await transaction.artistProfile.createMany({
          data: plan.artists.map((artist) => ({
            id: mustGet(artistIds, artist.nickname),
            realName: artist.realName,
            nickname: artist.nickname,
            nicknameNormalized: artist.nickname.toLocaleLowerCase('zh-CN'),
            siteId: mustGet(siteIds, artist.siteName),
            sourceImportBatchId: batchIds.artists,
          })),
        });
        await transaction.operatorProfile.createMany({
          data: plan.operators.map((operator) => ({
            id: mustGet(operatorIds, operator.realName),
            realName: operator.realName,
            nameNormalized: operator.realName.toLocaleLowerCase('zh-CN'),
            siteId: mustGet(siteIds, operator.siteName),
            sourceImportBatchId: batchIds.operators,
          })),
        });
        await transaction.hostOperatorRelation.createMany({
          data: plan.relations.flatMap((relation) => {
            if (!relation.resolvedOperator) return [];
            return [
              {
                id: mustGet(relationIds, relation.rowNumber),
                hostId: mustGet(hostIds, relation.hostCode),
                operatorId: mustGet(operatorIds, relation.resolvedOperator.realName),
                validFrom,
                changeReason: '首次名单迁移',
                sourceImportBatchId: batchIds.relations,
              },
            ];
          }),
        });

        const importRows: Prisma.ImportRowCreateManyInput[] = [
          ...plan.hosts.map((host) => ({
            importBatchId: batchIds.hosts,
            sheetName: 'Sheet1',
            rowNumber: host.rowNumber,
            businessKey: host.hostCode,
            rawData: {
              主播编号: host.hostCode,
              主播姓名: host.realName,
              场地: host.siteName,
            },
            normalizedData: {
              hostCode: host.hostCode,
              realName: host.realName,
              siteName: host.siteName,
            },
            validationStatus: 'VALID',
            errors: [],
            plannedAction: 'CREATE',
            targetEntityId: mustGet(hostIds, host.hostCode),
            appliedAt: now,
          })),
          ...plan.artists.map((artist) => ({
            importBatchId: batchIds.artists,
            sheetName: 'Sheet1',
            rowNumber: artist.rowNumber,
            businessKey: artist.nickname,
            rawData: {
              姓名: artist.realName,
              化妆师: artist.nickname,
              场地: artist.siteName,
            },
            normalizedData: {
              realName: artist.realName,
              nickname: artist.nickname,
              siteName: artist.siteName,
            },
            validationStatus: 'VALID',
            errors: [],
            plannedAction: 'CREATE',
            targetEntityId: mustGet(artistIds, artist.nickname),
            appliedAt: now,
          })),
          ...plan.operators.map((operator) => ({
            importBatchId: batchIds.operators,
            sheetName: 'Sheet1',
            rowNumber: operator.rowNumber,
            businessKey: operator.realName,
            rawData: { 运营: operator.realName, 场地: operator.siteName },
            normalizedData: {
              realName: operator.realName,
              siteName: operator.siteName,
            },
            validationStatus: 'VALID',
            errors: [],
            plannedAction: 'CREATE',
            targetEntityId: mustGet(operatorIds, operator.realName),
            appliedAt: now,
          })),
          ...plan.relations.map((relation) => {
            const targetId = relationIds.get(relation.rowNumber);
            return {
              importBatchId: batchIds.relations,
              sheetName: 'Sheet1',
              rowNumber: relation.rowNumber,
              businessKey: relation.hostCode,
              rawData: {
                主播编号: relation.hostCode,
                运营: relation.operatorName,
              },
              normalizedData: {
                hostCode: relation.hostCode,
                operatorName: relation.operatorName,
              },
              validationStatus: relation.warningCode ? 'WARNING' : 'VALID',
              errors: relation.warningCode ? [{ code: relation.warningCode }] : [],
              plannedAction: targetId ? 'CREATE' : 'REJECT',
              targetEntityId: targetId ?? null,
              appliedAt: targetId ? now : null,
            };
          }),
        ];
        await transaction.importRow.createMany({
          data: importRows,
        });
        await transaction.operationLog.createMany({
          data: Object.values(batchIds).map((batchId) => ({
            objectType: 'IMPORT_BATCH',
            objectId: batchId,
            action: 'INITIAL_IMPORT_SUCCEEDED',
            actorUserId: actor.id,
            actorNameSnapshot: actor.displayName,
            actorRole: 'ADMIN',
            reason: '首次人员名单迁移',
            afterData: { status: 'SUCCEEDED' },
            clientType: 'CLI',
          })),
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
  const plan = await loadSourceImportPlan(options.sourceDir);
  console.log(JSON.stringify(publicSummary(plan), null, 2));
  if (!options.confirm) return;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const currentDatabase = databaseName(connectionString);
  if (!options.expectedDatabase || options.expectedDatabase !== currentDatabase) {
    throw new Error('--expected-database must exactly match the DATABASE_URL database name');
  }
  if (!options.actorUserId) throw new Error('--actor-user-id is required with --confirm');

  await applyInitialImport(
    plan,
    connectionString,
    options.actorUserId,
    effectiveDate(options.effectiveDate),
  );
  console.log(`Initial source import succeeded in database ${currentDatabase}`);
}

main().catch((error: unknown) => {
  if (error instanceof SourceDataValidationError) {
    console.error(error.message);
  } else {
    console.error(error instanceof Error ? error.message : 'Source import failed');
  }
  process.exitCode = 1;
});
