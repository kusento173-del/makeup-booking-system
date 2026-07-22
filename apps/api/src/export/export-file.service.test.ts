import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import { ExportFileUnavailableError } from './export.errors';
import { ExportFileService } from './export-file.service';

const jobId = '019b0000-0000-7000-8000-000000000010';
const siteId = '019b0000-0000-7000-8000-000000000001';
const buffer = Buffer.from('valid xlsx fixture');
const job = {
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  expiresAt: new Date('2026-07-24T12:00:00.000Z'),
  fileSha256: createHash('sha256').update(buffer).digest('hex'),
  fileSizeBytes: BigInt(buffer.byteLength),
  id: jobId,
  outputFilename: '2026-07-23_单场地_排班.xlsx',
  scope: 'SINGLE_SITE',
  siteId,
  status: 'SUCCEEDED',
  storageKey: `local/${jobId}.xlsx`,
};
const customerService = {
  roleAssignmentId: 'role-1',
  roleCode: 'CUSTOMER_SERVICE' as const,
  siteId,
  userId: 'user-1',
};
const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env.EXPORT_STORAGE_DIR;
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function setup(record: typeof job = job) {
  const directory = await mkdtemp(join(tmpdir(), 'makeup-export-download-'));
  temporaryDirectories.push(directory);
  process.env.EXPORT_STORAGE_DIR = directory;
  await writeFile(join(directory, `${jobId}.xlsx`), buffer);
  const database = {
    read: vi.fn((callback: (client: unknown) => unknown) =>
      callback({ exportJob: { findUnique: vi.fn().mockResolvedValue(record) } }),
    ),
  };
  return new ExportFileService(new AuthorizationPolicyService(), database as never);
}

describe('ExportFileService', () => {
  it('returns a verified file to customer service in the same site', async () => {
    const service = await setup();

    await expect(
      service.get(customerService, jobId, new Date('2026-07-23T12:00:00.000Z')),
    ).resolves.toEqual({
      buffer,
      contentType: job.contentType,
      filename: job.outputFilename,
    });
  });

  it('denies cross-site customer-service downloads before reading the file', async () => {
    const service = await setup();
    await expect(
      service.get({ ...customerService, siteId: '019b0000-0000-7000-8000-000000000099' }, jobId),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it('rejects expired or tampered files', async () => {
    const expiredService = await setup({ ...job, expiresAt: new Date('2026-07-22T12:00:00.000Z') });
    await expect(
      expiredService.get(customerService, jobId, new Date('2026-07-23T12:00:00.000Z')),
    ).rejects.toBeInstanceOf(ExportFileUnavailableError);

    const tamperedService = await setup({ ...job, fileSha256: '0'.repeat(64) });
    await expect(
      tamperedService.get(customerService, jobId, new Date('2026-07-23T12:00:00.000Z')),
    ).rejects.toBeInstanceOf(ExportFileUnavailableError);
  });
});
