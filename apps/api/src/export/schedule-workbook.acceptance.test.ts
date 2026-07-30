import { performance } from 'node:perf_hooks';

import * as ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { buildScheduleWorkbook, type ScheduleExportRow } from './schedule-workbook';

const ROW_COUNT = 1_500;
const MAX_GENERATION_MS = 10_000;
const MAX_FILE_BYTES = 5_000_000;

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function fixtureRows(): readonly ScheduleExportRow[] {
  return Array.from({ length: ROW_COUNT }, (_, index) => {
    const startMinute = 480 + (index % 32) * 15;
    const durationMinutes = index % 4 === 0 ? 45 : 30;
    return {
      appointmentType: index % 3 === 0 ? 'FIXED' : 'SINGLE',
      artistNickname: `化妆师${String(index % 100).padStart(3, '0')}`,
      durationMinutes,
      endMinute: startMinute + durationMinutes,
      hostCode: `ZB${String(index + 1).padStart(5, '0')}`,
      hostName: `主播${index + 1}`,
      operatorName: index % 7 === 0 ? null : `运营${(index % 200) + 1}`,
      scheduleDate: '2026-07-23',
      siteName: `场地${(index % 3) + 1}`,
      startMinute,
      status: index % 5 === 0 ? 'COMPLETED' : 'BOOKED',
    };
  });
}

describe('M6 schedule export acceptance', () => {
  it('keeps 1500 schedule rows consistent within the generation budget', async () => {
    const rows = fixtureRows();
    const startedAt = performance.now();
    const buffer = await buildScheduleWorkbook(rows);
    const generationMs = performance.now() - startedAt;

    expect(generationMs).toBeLessThan(MAX_GENERATION_MS);
    expect(buffer.byteLength).toBeLessThan(MAX_FILE_BYTES);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const standard = workbook.getWorksheet('标准排班');
    const details = workbook.getWorksheet('扩展信息');
    expect(standard?.rowCount).toBe(ROW_COUNT + 1);
    expect(details?.rowCount).toBe(ROW_COUNT + 1);

    for (const [index, source] of rows.entries()) {
      const rowNumber = index + 2;
      expect(standard?.getRow(rowNumber).values).toEqual([
        undefined,
        source.artistNickname,
        minuteLabel(source.startMinute),
        source.hostCode,
        source.hostName,
      ]);
      expect(details?.getRow(rowNumber).values).toEqual([
        undefined,
        source.scheduleDate,
        source.siteName,
        source.artistNickname,
        minuteLabel(source.startMinute),
        minuteLabel(source.endMinute),
        source.hostCode,
        source.hostName,
        source.operatorName ?? undefined,
        source.durationMinutes === 45 ? '特殊妆' : '现代妆',
        source.durationMinutes,
        source.appointmentType === 'FIXED' ? '固定' : '单次',
        source.status === 'COMPLETED' ? '已完成' : '已预约',
      ]);
    }
  }, 20_000);
});
