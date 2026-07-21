import { Module } from '@nestjs/common';

import { provideDatabaseClient } from './database-client.provider';
import { DATABASE_CLIENT } from './database.constants';
import { DatabaseService } from './database.service';

@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      useFactory: provideDatabaseClient,
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
