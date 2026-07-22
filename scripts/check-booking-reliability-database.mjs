import { runDatabaseCheck } from './run-database-check.mjs';

runDatabaseCheck(
  new URL('../prisma/checks/booking-reliability.sql', import.meta.url),
  'Booking reliability database constraints: verified',
);
