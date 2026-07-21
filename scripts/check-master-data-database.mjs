import { runDatabaseCheck } from './run-database-check.mjs';

runDatabaseCheck(
  new URL('../prisma/checks/master-data.sql', import.meta.url),
  'Master data database constraints: verified',
);
