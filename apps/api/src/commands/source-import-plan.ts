import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

import * as ExcelJS from 'exceljs';

const FILE_NAMES = {
  artists: '化妆师人员表.xlsx',
  fixedReference: '化妆师固定主播名单.xlsx',
  hosts: '线下主播人员表.xlsx',
  operators: '运营人员表.xlsx',
  relations: '主播与运营对应表.xlsx',
} as const;

const VALID_SITES = new Set(['松江', '现厂', '无锡']);

export interface SourceFile {
  fileName: string;
  filePath: string;
  sha256: string;
}

export interface SourceHost {
  rowNumber: number;
  hostCode: string;
  realName: string;
  siteName: string;
}

export interface SourceArtist {
  rowNumber: number;
  realName: string;
  nickname: string;
  siteName: string;
}

export interface SourceOperator {
  rowNumber: number;
  realName: string;
  siteName: string;
}

export interface SourceHostOperatorRelation {
  rowNumber: number;
  hostCode: string;
  operatorName: string;
  resolvedOperator: SourceOperator | null;
  warningCode: 'OPERATOR_NOT_FOUND' | 'SITE_MISMATCH' | null;
}

export interface SourceImportPlan {
  files: Record<keyof typeof FILE_NAMES, SourceFile>;
  hosts: SourceHost[];
  artists: SourceArtist[];
  operators: SourceOperator[];
  relations: SourceHostOperatorRelation[];
  fixedReferenceRowCount: number;
  summary: {
    hosts: number;
    artists: number;
    operators: number;
    relations: number;
    resolvedRelations: number;
    unassignedRelations: number;
    hostsWithoutRelationRow: number;
  };
}

export class SourceDataValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Source data validation failed with ${issues.length} issue(s)`);
    this.name = 'SourceDataValidationError';
  }
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.normalize('NFKC').trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString().normalize('NFKC').trim();
  }
  if (value instanceof Date) return value.toISOString();
  return '';
}

export function normalizeRelationOperatorName(value: unknown): string {
  const normalized = normalizeText(value);
  return normalized === '0' ? '' : normalized;
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  if ('result' in value) return value.result;
  if ('error' in value) return value.error;
  if ('richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  return cell.text;
}

async function loadSheet(filePath: string): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (error) {
    throw new Error(
      `${path.basename(filePath)}: ${error instanceof Error ? error.message : 'workbook read failed'}`,
      { cause: error },
    );
  }
  const worksheet = workbook.getWorksheet('Sheet1');
  if (!worksheet)
    throw new SourceDataValidationError([`${path.basename(filePath)}: missing Sheet1`]);
  return worksheet;
}

function assertHeaders(
  worksheet: ExcelJS.Worksheet,
  fileName: string,
  expectedHeaders: readonly string[],
): void {
  const headers = expectedHeaders.map((_, index) =>
    normalizeText(cellValue(worksheet.getCell(1, index + 1))),
  );
  if (headers.some((header, index) => header !== expectedHeaders[index])) {
    throw new SourceDataValidationError([`${fileName}: unexpected headers`]);
  }
}

function duplicateKeys<T>(rows: readonly T[], keyOf: (row: T) => string): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

function validateRequired(
  fileName: string,
  rowNumber: number,
  values: Readonly<Record<string, string>>,
  issues: string[],
): void {
  for (const [field, value] of Object.entries(values)) {
    if (!value) issues.push(`${fileName}:${rowNumber}: missing ${field}`);
  }
}

async function describeFile(sourceDir: string, fileName: string): Promise<SourceFile> {
  const filePath = path.join(sourceDir, fileName);
  const sha256 = createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex')
    .toUpperCase();
  return { fileName, filePath, sha256 };
}

export async function loadSourceImportPlan(sourceDir: string): Promise<SourceImportPlan> {
  const files = Object.fromEntries(
    await Promise.all(
      Object.entries(FILE_NAMES).map(async ([key, fileName]) => [
        key,
        await describeFile(sourceDir, fileName),
      ]),
    ),
  ) as SourceImportPlan['files'];
  const [hostSheet, artistSheet, operatorSheet, relationSheet, fixedSheet] = await Promise.all([
    loadSheet(files.hosts.filePath),
    loadSheet(files.artists.filePath),
    loadSheet(files.operators.filePath),
    loadSheet(files.relations.filePath),
    loadSheet(files.fixedReference.filePath),
  ]);

  assertHeaders(hostSheet, files.hosts.fileName, ['主播编号', '主播姓名', '场地']);
  assertHeaders(artistSheet, files.artists.fileName, ['姓名', '化妆师', '场地']);
  assertHeaders(operatorSheet, files.operators.fileName, ['运营', '场地']);
  assertHeaders(relationSheet, files.relations.fileName, ['主播编号', '运营']);
  assertHeaders(fixedSheet, files.fixedReference.fileName, ['固定主播编号', '化妆师']);

  const issues: string[] = [];
  const hosts: SourceHost[] = [];
  const artists: SourceArtist[] = [];
  const operators: SourceOperator[] = [];
  const relationRows: Array<{ rowNumber: number; hostCode: string; operatorName: string }> = [];

  hostSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const host = {
      rowNumber,
      hostCode: normalizeText(cellValue(row.getCell(1))),
      realName: normalizeText(cellValue(row.getCell(2))),
      siteName: normalizeText(cellValue(row.getCell(3))),
    };
    if (!host.hostCode && !host.realName && !host.siteName) return;
    validateRequired(
      files.hosts.fileName,
      rowNumber,
      { hostCode: host.hostCode, realName: host.realName, siteName: host.siteName },
      issues,
    );
    if (host.siteName && !VALID_SITES.has(host.siteName)) {
      issues.push(`${files.hosts.fileName}:${rowNumber}: invalid site`);
    }
    hosts.push(host);
  });

  artistSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const artist = {
      rowNumber,
      realName: normalizeText(cellValue(row.getCell(1))),
      nickname: normalizeText(cellValue(row.getCell(2))),
      siteName: normalizeText(cellValue(row.getCell(3))),
    };
    if (!artist.realName && !artist.nickname && !artist.siteName) return;
    validateRequired(
      files.artists.fileName,
      rowNumber,
      {
        realName: artist.realName,
        nickname: artist.nickname,
        siteName: artist.siteName,
      },
      issues,
    );
    if (artist.siteName && !VALID_SITES.has(artist.siteName)) {
      issues.push(`${files.artists.fileName}:${rowNumber}: invalid site`);
    }
    artists.push(artist);
  });

  operatorSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const operator = {
      rowNumber,
      realName: normalizeText(cellValue(row.getCell(1))),
      siteName: normalizeText(cellValue(row.getCell(2))),
    };
    if (!operator.realName && !operator.siteName) return;
    validateRequired(
      files.operators.fileName,
      rowNumber,
      { realName: operator.realName, siteName: operator.siteName },
      issues,
    );
    if (operator.siteName && !VALID_SITES.has(operator.siteName)) {
      issues.push(`${files.operators.fileName}:${rowNumber}: invalid site`);
    }
    operators.push(operator);
  });

  relationSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const relation = {
      rowNumber,
      hostCode: normalizeText(cellValue(row.getCell(1))),
      operatorName: normalizeRelationOperatorName(cellValue(row.getCell(2))),
    };
    if (!relation.hostCode && !relation.operatorName) return;
    if (!relation.hostCode) {
      issues.push(`${files.relations.fileName}:${rowNumber}: missing hostCode`);
    }
    relationRows.push(relation);
  });

  for (const key of duplicateKeys(hosts, (row) => row.hostCode)) {
    issues.push(`${files.hosts.fileName}: duplicate hostCode ${key}`);
  }
  for (const key of duplicateKeys(artists, (row) => row.nickname.toLocaleLowerCase('zh-CN'))) {
    issues.push(`${files.artists.fileName}: duplicate nickname ${key}`);
  }
  for (const key of duplicateKeys(operators, (row) => row.realName)) {
    issues.push(`${files.operators.fileName}: duplicate operator name ${key}`);
  }
  for (const key of duplicateKeys(relationRows, (row) => row.hostCode)) {
    issues.push(`${files.relations.fileName}: duplicate hostCode ${key}`);
  }
  if (issues.length > 0) throw new SourceDataValidationError(issues);

  const hostByCode = new Map(hosts.map((host) => [host.hostCode, host]));
  const operatorByName = new Map(operators.map((operator) => [operator.realName, operator]));
  const relations = relationRows.map<SourceHostOperatorRelation>((row) => {
    const host = hostByCode.get(row.hostCode);
    if (!host) {
      issues.push(`${files.relations.fileName}:${row.rowNumber}: host not found`);
      return { ...row, resolvedOperator: null, warningCode: null };
    }
    const operator = operatorByName.get(row.operatorName);
    if (!operator) {
      return { ...row, resolvedOperator: null, warningCode: 'OPERATOR_NOT_FOUND' };
    }
    if (operator.siteName !== host.siteName) {
      return { ...row, resolvedOperator: null, warningCode: 'SITE_MISMATCH' };
    }
    return { ...row, resolvedOperator: operator, warningCode: null };
  });
  if (issues.length > 0) throw new SourceDataValidationError(issues);

  let fixedReferenceRowCount = 0;
  fixedSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (normalizeText(cellValue(row.getCell(1))) || normalizeText(cellValue(row.getCell(2)))) {
      fixedReferenceRowCount += 1;
    }
  });

  const resolvedRelations = relations.filter((relation) => relation.resolvedOperator).length;
  const relationHostCodes = new Set(relations.map((relation) => relation.hostCode));
  return {
    files,
    hosts,
    artists,
    operators,
    relations,
    fixedReferenceRowCount,
    summary: {
      hosts: hosts.length,
      artists: artists.length,
      operators: operators.length,
      relations: relations.length,
      resolvedRelations,
      unassignedRelations: relations.length - resolvedRelations,
      hostsWithoutRelationRow: hosts.filter((host) => !relationHostCodes.has(host.hostCode)).length,
    },
  };
}
