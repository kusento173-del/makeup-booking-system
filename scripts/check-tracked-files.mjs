import { spawnSync } from 'node:child_process';
import path from 'node:path';

const gitResult = spawnSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
  windowsHide: true,
});

if (gitResult.error) {
  throw gitResult.error;
}

if (gitResult.status !== 0) {
  throw new Error(gitResult.stderr.trim() || 'Unable to inspect Git tracked files');
}

const blockedDirectories = [
  'backups/',
  'data/private/',
  'data/processed/',
  'data/source/',
  'exports/',
  'private-data/',
  'uploads/',
];
const blockedExtensions = new Set([
  '.7z',
  '.bak',
  '.backup',
  '.csv',
  '.dump',
  '.key',
  '.p12',
  '.pem',
  '.pfx',
  '.rar',
  '.sqlite',
  '.sqlite3',
  '.tsv',
  '.xls',
  '.xlsx',
  '.zip',
]);
const blockedKeyNames = new Set(['id_dsa', 'id_ecdsa', 'id_ed25519', 'id_rsa']);

const trackedFiles = gitResult.stdout.split('\0').filter(Boolean);
const blockedFiles = trackedFiles.filter((file) => {
  const normalizedFile = file.replaceAll('\\', '/').toLowerCase();
  const baseName = path.posix.basename(normalizedFile);
  const isEnvironmentFile = baseName === '.env' || baseName.startsWith('.env.');

  if (normalizedFile === '.env.example') {
    return false;
  }

  return (
    isEnvironmentFile ||
    blockedDirectories.some((directory) => normalizedFile.startsWith(directory)) ||
    blockedExtensions.has(path.posix.extname(baseName)) ||
    blockedKeyNames.has(baseName)
  );
});

if (blockedFiles.length > 0) {
  throw new Error(`Sensitive or private files are tracked by Git:\n${blockedFiles.join('\n')}`);
}

console.log(
  `Repository policy: checked ${trackedFiles.length} tracked files; no blocked paths found`,
);
