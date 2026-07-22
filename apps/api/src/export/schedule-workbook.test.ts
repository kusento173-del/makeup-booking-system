import * as ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { buildScheduleWorkbook } from './schedule-workbook';

describe('schedule workbook', () => {
  it('generates the standard four columns and structured detail sheet', async () => {
    const buffer = await buildScheduleWorkbook([
      {
        appointmentType: 'FIXED',
        artistNickname: '柔柔',
        durationMinutes: 30,
        endMinute: 600,
        hostCode: 'ZB01842',
        hostName: '小雨',
        operatorName: '运营甲',
        scheduleDate: '2026-07-23',
        siteName: '松江场地',
        startMinute: 570,
        status: 'BOOKED',
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    const standard = workbook.getWorksheet('标准排班');
    expect(standard?.getRow(1).values).toEqual([
      undefined,
      '化妆师',
      '时间',
      '主播编号',
      '主播姓名',
    ]);
    expect(standard?.getRow(2).values).toEqual([undefined, '柔柔', '09:30', 'ZB01842', '小雨']);
    expect(workbook.getWorksheet('扩展信息')?.getCell('J2').value).toBe('固定');
  });

  it('neutralizes formula-like text from snapshots', async () => {
    const buffer = await buildScheduleWorkbook([
      {
        appointmentType: 'SINGLE',
        artistNickname: '=HYPERLINK("bad")',
        durationMinutes: 45,
        endMinute: 645,
        hostCode: '+100',
        hostName: '@evil',
        operatorName: '-danger',
        scheduleDate: '2026-07-23',
        siteName: '松江场地',
        startMinute: 600,
        status: 'COMPLETED',
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    expect(workbook.getWorksheet('标准排班')?.getCell('A2').value).toBe(`'${'=HYPERLINK("bad")'}`);
    expect(workbook.getWorksheet('扩展信息')?.getCell('H2').value).toBe("'-danger");
  });
});
