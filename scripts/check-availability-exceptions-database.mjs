import { runDatabaseCheck } from './run-database-check.mjs';

runDatabaseCheck(
  new URL('../prisma/checks/availability-exceptions.sql', import.meta.url),
  'Leave and overtime database constraints: verified',
);

runDatabaseCheck(
  new URL('../prisma/checks/artist-unavailable-periods.sql', import.meta.url),
  'Artist unavailable period database constraints: verified',
);
