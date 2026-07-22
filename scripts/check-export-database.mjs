import { runDatabaseCheck } from './run-database-check.mjs';

runDatabaseCheck(
  new URL('../prisma/checks/export.sql', import.meta.url),
  'Export database constraints: verified',
);
