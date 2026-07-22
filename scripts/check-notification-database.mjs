import { runDatabaseCheck } from './run-database-check.mjs';

runDatabaseCheck(
  new URL('../prisma/checks/notification.sql', import.meta.url),
  'Notification database constraints: verified',
);
