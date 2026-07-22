import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExportCleanupService } from './export-cleanup.service';

const job = {
  id: '019b0000-0000-7000-8000-000000000010',
  rowVersion: 3,
  siteId: '019b0000-0000-7000-8000-000000000001',
  storageKey: 'local/019b0000-0000-7000-8000-000000000010.xlsx',
};
const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env.EXPORT_STORAGE_DIR;
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

describe('ExportCleanupService', () => {
  it('deletes only the claimed expired file and records the cleanup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'makeup-export-cleanup-'));
    temporaryDirectories.push(directory);
    process.env.EXPORT_STORAGE_DIR = directory;
    const target = join(directory, `${job.id}.xlsx`);
    const sibling = join(directory, 'keep.xlsx');
    await Promise.all([writeFile(target, 'expired'), writeFile(sibling, 'keep')]);

    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([job]),
      exportJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const database = {
      transaction: vi.fn((callback: (client: unknown) => unknown) => callback(transaction)),
    };
    const audit = { append: vi.fn().mockResolvedValue('audit-1') };
    const service = new ExportCleanupService(audit as never, database as never);
    const now = new Date('2026-07-24T12:00:00.000Z');

    await expect(service.runOne(now)).resolves.toEqual({ cleaned: true, exportJobId: job.id });
    await expect(exists(target)).resolves.toBe(false);
    await expect(exists(sibling)).resolves.toBe(true);
    expect(transaction.exportJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { rowVersion: { increment: 1 }, storageDeletedAt: now } }),
    );
    expect(audit.append).toHaveBeenCalledOnce();
  });

  it('is idle when no expired file is claimable', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      exportJob: { updateMany: vi.fn() },
    };
    const database = {
      transaction: vi.fn((callback: (client: unknown) => unknown) => callback(transaction)),
    };
    const audit = { append: vi.fn() };
    const service = new ExportCleanupService(audit as never, database as never);

    await expect(service.runOne()).resolves.toEqual({ cleaned: false, exportJobId: null });
    expect(transaction.exportJob.updateMany).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('rejects a storage key that does not exactly match the job', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'makeup-export-cleanup-'));
    temporaryDirectories.push(directory);
    process.env.EXPORT_STORAGE_DIR = directory;
    const sibling = join(directory, 'keep.xlsx');
    await writeFile(sibling, 'keep');
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ ...job, storageKey: 'local/keep.xlsx' }]),
      exportJob: { updateMany: vi.fn() },
    };
    const database = {
      transaction: vi.fn((callback: (client: unknown) => unknown) => callback(transaction)),
    };
    const service = new ExportCleanupService({ append: vi.fn() } as never, database as never);

    await expect(service.runOne()).rejects.toThrow('Invalid local export storage key');
    await expect(exists(sibling)).resolves.toBe(true);
    expect(transaction.exportJob.updateMany).not.toHaveBeenCalled();
  });
});
