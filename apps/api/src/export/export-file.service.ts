import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { Injectable } from '@nestjs/common';

import {
  AuthorizationDeniedError,
  AuthorizationPolicyService,
} from '../auth/authorization-policy.service';
import type { VerifiedAuthorizationContext } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { ExportFileUnavailableError, ExportNotFoundError } from './export.errors';
import { localExportStoragePath } from './export-storage';

export interface AuthorizedExportFile {
  readonly buffer: Buffer;
  readonly contentType: string;
  readonly filename: string;
}

@Injectable()
export class ExportFileService {
  constructor(
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  async get(
    context: VerifiedAuthorizationContext,
    exportJobId: string,
    now = new Date(),
  ): Promise<AuthorizedExportFile> {
    this.authorization.assertRole(context, ['CUSTOMER_SERVICE', 'ADMIN']);
    const job = await this.database.read((client) =>
      client.exportJob.findUnique({
        select: {
          contentType: true,
          expiresAt: true,
          fileSha256: true,
          fileSizeBytes: true,
          id: true,
          outputFilename: true,
          scope: true,
          siteId: true,
          status: true,
          storageDeletedAt: true,
          storageKey: true,
        },
        where: { id: exportJobId },
      }),
    );
    if (!job) throw new ExportNotFoundError();
    if (
      context.roleCode === 'CUSTOMER_SERVICE' &&
      (job.scope !== 'SINGLE_SITE' || !context.siteId || job.siteId !== context.siteId)
    ) {
      throw new AuthorizationDeniedError();
    }
    if (
      job.status !== 'SUCCEEDED' ||
      job.storageDeletedAt !== null ||
      !job.expiresAt ||
      job.expiresAt <= now ||
      !job.outputFilename ||
      !job.contentType ||
      !job.storageKey ||
      job.fileSizeBytes === null ||
      !job.fileSha256
    ) {
      throw new ExportFileUnavailableError();
    }

    let path: string;
    try {
      path = localExportStoragePath(job.id, job.storageKey);
    } catch {
      throw new ExportFileUnavailableError();
    }
    const buffer = await readFile(path).catch(() => {
      throw new ExportFileUnavailableError();
    });
    if (
      BigInt(buffer.byteLength) !== job.fileSizeBytes ||
      createHash('sha256').update(buffer).digest('hex') !== job.fileSha256
    ) {
      throw new ExportFileUnavailableError();
    }
    return { buffer, contentType: job.contentType, filename: job.outputFilename };
  }
}
