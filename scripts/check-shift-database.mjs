import { runDatabaseCheck } from './run-database-check.mjs';

runDatabaseCheck(
  new URL('../prisma/checks/shift.sql', import.meta.url),
  'Shift database constraints: verified',
);
