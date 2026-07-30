import * as ExcelJS from 'exceljs';

export interface ScheduleExportRow {
  readonly appointmentType: 'FIXED' | 'SINGLE';
  readonly artistNickname: string;
  readonly durationMinutes: number;
  readonly endMinute: number;
  readonly hostCode: string;
  readonly hostName: string;
  readonly operatorName: string | null;
  readonly scheduleDate: string;
  readonly siteName: string;
  readonly startMinute: number;
  readonly status: 'BOOKED' | 'COMPLETED';
}

const HEADER_FILL = '244F64';
const HEADER_FONT = 'FFFFFF';
const MAKEUP_TYPE_LABELS: Readonly<Record<number, string>> = {
  15: '指导妆',
  30: '现代妆',
  45: '特殊妆',
  60: '仿妆',
};

function safeText(value: string): string {
  const normalized = value.normalize('NFKC').trim();
  return /^[=+\-@\t\r]/.test(normalized) ? `'${normalized}` : normalized;
}

function minuteLabel(minute: number): string {
  const hour = Math.floor(minute / 60);
  const remainder = minute % 60;
  return `${String(hour).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatHeader(worksheet: ExcelJS.Worksheet): void {
  const row = worksheet.getRow(1);
  row.height = 24;
  row.eachCell((cell) => {
    cell.fill = { fgColor: { argb: HEADER_FILL }, pattern: 'solid', type: 'pattern' };
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = { from: 'A1', to: `${worksheet.lastColumn?.letter ?? 'A'}1` };
}

export async function buildScheduleWorkbook(rows: readonly ScheduleExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '化妆部预约系统';
  workbook.created = new Date();
  workbook.modified = workbook.created;

  const standard = workbook.addWorksheet('标准排班', {
    properties: { defaultRowHeight: 21 },
  });
  standard.columns = [
    { header: '化妆师', key: 'artist', width: 18 },
    { header: '时间', key: 'time', width: 12 },
    { header: '主播编号', key: 'hostCode', width: 18 },
    { header: '主播姓名', key: 'hostName', width: 18 },
  ];
  for (const row of rows) {
    standard.addRow({
      artist: safeText(row.artistNickname),
      hostCode: safeText(row.hostCode),
      hostName: safeText(row.hostName),
      time: minuteLabel(row.startMinute),
    });
  }
  formatHeader(standard);

  const details = workbook.addWorksheet('扩展信息', {
    properties: { defaultRowHeight: 21 },
  });
  details.columns = [
    { header: '日期', key: 'date', width: 13 },
    { header: '场地', key: 'site', width: 16 },
    { header: '化妆师', key: 'artist', width: 18 },
    { header: '开始时间', key: 'start', width: 12 },
    { header: '结束时间', key: 'end', width: 12 },
    { header: '主播编号', key: 'hostCode', width: 18 },
    { header: '主播姓名', key: 'hostName', width: 18 },
    { header: '运营', key: 'operator', width: 16 },
    { header: '妆容类型', key: 'makeupType', width: 14 },
    { header: '时长（分钟）', key: 'duration', width: 14 },
    { header: '预约类型', key: 'type', width: 12 },
    { header: '状态', key: 'status', width: 12 },
  ];
  for (const row of rows) {
    details.addRow({
      artist: safeText(row.artistNickname),
      date: row.scheduleDate,
      duration: row.durationMinutes,
      end: minuteLabel(row.endMinute),
      hostCode: safeText(row.hostCode),
      hostName: safeText(row.hostName),
      makeupType: MAKEUP_TYPE_LABELS[row.durationMinutes] ?? '未知',
      operator: row.operatorName ? safeText(row.operatorName) : null,
      site: safeText(row.siteName),
      start: minuteLabel(row.startMinute),
      status: row.status === 'COMPLETED' ? '已完成' : '已预约',
      type: row.appointmentType === 'FIXED' ? '固定' : '单次',
    });
  }
  details.getColumn('duration').numFmt = '0';
  formatHeader(details);

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
