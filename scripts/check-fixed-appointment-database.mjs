import { runDatabaseCheck } from './run-database-check.mjs';

runDatabaseCheck(
  new URL('../prisma/checks/fixed-appointment.sql', import.meta.url),
  'Fixed appointment database constraints: verified',
);
