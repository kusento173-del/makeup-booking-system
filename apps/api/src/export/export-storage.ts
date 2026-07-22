import { resolve } from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function localExportStorageKey(exportJobId: string): string {
  if (!UUID.test(exportJobId)) throw new Error('Invalid export job identifier');
  return `local/${exportJobId}.xlsx`;
}

export function localExportStoragePath(exportJobId: string, storageKey: string): string {
  if (storageKey !== localExportStorageKey(exportJobId)) {
    throw new Error('Invalid local export storage key');
  }
  return resolve(exportStorageRoot(), `${exportJobId}.xlsx`);
}

export function exportStorageRoot(): string {
  return resolve(process.env.EXPORT_STORAGE_DIR ?? resolve(process.cwd(), 'var', 'exports'));
}
