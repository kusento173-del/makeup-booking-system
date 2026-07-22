import { runDatabaseCheck } from './run-database-check.mjs';

runDatabaseCheck(
  new URL('../prisma/checks/availability-exceptions.sql', import.meta.url),
  'Leave and overtime database constraints: verified',
);
