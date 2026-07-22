import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as ExcelJS from 'exceljs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExportProcessorService } from './export-processor.service';

const job = {
  id: '019b0000-0000-7000-8000-000000000010',
  rowVersion: 2,
  scheduleDate: new Date('2026-07-23T00:00:00.000Z'),
  scope: 'SINGLE_SITE',
  siteId: '019b0000-0000-7000-8000-000000000001',
  status: 'PROCESSING',
};

const appointment = {
  appointmentType: 'SINGLE',
  artistNicknameSnapshot: '柔柔',
  durationMinutes: 30,
  endAt: new Date('2026-07-23T02:00:00.000Z'),
  hostCodeSnapshot: 'ZB01842',
  hostNameSnapshot: '小雨',
  id: 'appointment-1',
  operatorNameSnapshot: '运营甲',
  siteId: job.siteId,
  siteNameSnapshot: '松江场地',
  startAt: new Date('2026-07-23T01:30:00.000Z'),
  status: 'BOOKED',
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env.EXPORT_STORAGE_DIR;
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('ExportProcessorService', () => {
  it('claims one job, writes a valid workbook and completes the state machine', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'makeup-export-test-'));
    temporaryDirectories.push(directory);
    process.env.EXPORT_STORAGE_DIR = directory;

    const claimTransaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: job.id }]),
      exportJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const completionTransaction = {
      exportJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const database = {
      read: vi
        .fn()
        .mockImplementationOnce((callback: (client: unknown) => unknown) =>
          callback({ exportJob: { findUnique: vi.fn().mockResolvedValue(job) } }),
        )
        .mockImplementationOnce((callback: (client: unknown) => unknown) =>
          callback({
            appointment: { findMany: vi.fn().mockResolvedValue([appointment]) },
            site: { findMany: vi.fn().mockResolvedValue([{ id: job.siteId }]) },
          }),
        ),
      transaction: vi
        .fn()
        .mockImplementationOnce((callback: (client: unknown) => unknown) =>
          callback(claimTransaction),
        )
        .mockImplementationOnce((callback: (client: unknown) => unknown) =>
          callback(completionTransaction),
        ),
    };
    const audit = { append: vi.fn().mockResolvedValue('audit-1') };
    const processor = new ExportProcessorService(audit as never, database as never);

    const result = await processor.runOne(new Date('2026-07-22T12:00:00.000Z'));

    expect(result).toEqual({ exportJobId: job.id, processed: true, status: 'SUCCEEDED' });
    expect(completionTransaction.exportJob.updateMany).toHaveBeenCalledOnce();
    const completionInput = completionTransaction.exportJob.updateMany.mock.calls[0]?.[0] as
      { data: { rowCount: number; status: string } } | undefined;
    expect(completionInput?.data).toMatchObject({ rowCount: 1, status: 'SUCCEEDED' });
    expect(audit.append).toHaveBeenCalledOnce();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await readFile(join(directory, `${job.id}.xlsx`))) as never);
    expect(workbook.getWorksheet('标准排班')?.getCell('B2').value).toBe('09:30');
  });

  it('does nothing when no pending job can be claimed', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      exportJob: { updateMany: vi.fn() },
    };
    const database = {
      read: vi.fn(),
      transaction: vi.fn((callback: (client: unknown) => unknown) => callback(transaction)),
    };
    const processor = new ExportProcessorService({ append: vi.fn() } as never, database as never);

    await expect(processor.runOne()).resolves.toEqual({
      exportJobId: null,
      processed: false,
      status: null,
    });
    expect(database.read).not.toHaveBeenCalled();
  });
});
