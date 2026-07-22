import { runDatabaseCheck } from './run-database-check.mjs';

runDatabaseCheck(
  new URL('../prisma/checks/appointment.sql', import.meta.url),
  'Appointment database constraints: verified',
);
