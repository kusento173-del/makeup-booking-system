import { runDatabaseCheck } from './run-database-check.mjs';

runDatabaseCheck(
  new URL('../prisma/checks/import.sql', import.meta.url),
  'Import database constraints: verified',
);
