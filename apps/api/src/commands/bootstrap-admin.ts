import 'dotenv/config';

import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

import { createDatabaseClient } from '@makeup/database';

import { AuditCommandService } from '../audit/audit-command.service';
import { AuditEntryFactory } from '../audit/audit-entry.factory';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { AuditSnapshotSanitizerService } from '../audit/audit-snapshot-sanitizer.service';
import { AuthRequestInvalidError } from '../auth/auth-request.parser';
import {
  InitialAdminAlreadyExistsError,
  InitialAdminInputInvalidError,
  InitialAdminLoginNameExistsError,
} from '../auth/initial-admin.errors';
import { InitialAdminService } from '../auth/initial-admin.service';
import { PasswordHasherService } from '../auth/password-hasher.service';
import { DatabaseService } from '../database/database.service';

class PasswordConfirmationMismatchError extends Error {}
class InteractiveTerminalRequiredError extends Error {}

class ConcealableOutput extends Writable {
  concealed = false;

  override _write(
    chunk: string | Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (!this.concealed) {
      stdout.write(chunk, encoding);
    }
    callback();
  }
}

async function collectCredentials(): Promise<{
  readonly displayName: string;
  readonly loginName: string;
  readonly password: string;
}> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new InteractiveTerminalRequiredError();
  }

  const output = new ConcealableOutput();
  const prompts = createInterface({ input: stdin, output, terminal: true });

  try {
    const loginName = await prompts.question('管理员登录名（3–64 位英文、数字、._-）：');
    const displayName = await prompts.question('管理员显示名称：');
    stdout.write('登录密码（12–128 位）：');
    output.concealed = true;
    const password = await prompts.question('');
    output.concealed = false;
    stdout.write('\n请再次输入密码：');
    output.concealed = true;
    const confirmation = await prompts.question('');
    output.concealed = false;
    stdout.write('\n');

    if (password !== confirmation) {
      throw new PasswordConfirmationMismatchError();
    }

    return { displayName, loginName, password };
  } finally {
    output.concealed = false;
    prompts.close();
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('缺少 DATABASE_URL，请先配置本地 .env');
  }

  const credentials = await collectCredentials();
  const client = createDatabaseClient(connectionString);
  const database = new DatabaseService(client);
  const audit = new AuditCommandService(
    new AuditEntryFactory(new AuditSnapshotSanitizerService()),
    new AuditLogRepository(),
  );
  const service = new InitialAdminService(audit, database, new PasswordHasherService());

  await database.onModuleInit();
  try {
    const result = await service.create(
      credentials.loginName,
      credentials.displayName,
      credentials.password,
    );
    stdout.write(`首次管理员已创建：${result.loginName}\n`);
  } finally {
    await database.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  if (error instanceof InitialAdminAlreadyExistsError) {
    console.error('系统中已存在有效管理员；此初始化命令不会再次创建账号。');
  } else if (
    error instanceof InitialAdminInputInvalidError ||
    error instanceof AuthRequestInvalidError
  ) {
    console.error('输入不符合要求：登录名为 3–64 位英文、数字、._-，密码为 12–128 位。');
  } else if (error instanceof InitialAdminLoginNameExistsError) {
    console.error('该登录名已被使用，未创建管理员。');
  } else if (error instanceof PasswordConfirmationMismatchError) {
    console.error('两次密码输入不一致，未创建管理员。');
  } else if (error instanceof InteractiveTerminalRequiredError) {
    console.error('必须在交互式终端中运行；为保护密码，不接受管道或命令参数。');
  } else {
    console.error('首次管理员创建失败，请确认数据库已启动且本地环境配置正确。');
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : 'UNKNOWN';
    console.error(`诊断代码：${errorCode}`);
  }

  process.exitCode = 1;
});
