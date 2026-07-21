import { runDatabaseCheck } from './run-database-check.mjs';

runDatabaseCheck(
  new URL('../prisma/checks/identity.sql', import.meta.url),
  'Identity database constraints: verified',
);
