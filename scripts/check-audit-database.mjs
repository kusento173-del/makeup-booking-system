import { runDatabaseCheck } from './run-database-check.mjs';

runDatabaseCheck(
  new URL('../prisma/checks/audit.sql', import.meta.url),
  'Audit database constraints: verified',
);
