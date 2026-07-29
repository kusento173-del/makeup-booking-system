import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';

const arguments_ = process.argv.slice(2).filter((value) => value !== '--');
const publicIp = arguments_[0]?.trim();
const certificateEmail = arguments_[1]?.trim();
const target = resolve(arguments_[2] ?? 'deploy/single-server.env');

if (!publicIp || !isIP(publicIp)) {
  throw new Error('请提供服务器公网 IPv4 或 IPv6 地址');
}
if (!certificateEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(certificateEmail)) {
  throw new Error('请提供有效的证书续期联系邮箱');
}
if (existsSync(target)) {
  throw new Error(`配置文件已存在，为避免覆盖生产密钥已停止：${target}`);
}

const secret = (bytes) => randomBytes(bytes).toString('base64url');
const authSecret = secret(32);
const workerToken = secret(32);
const postgresPassword = secret(24);
const redisPassword = secret(24);

const environment = `DEPLOYMENT_MODE=single-server
GATEWAY_TARGET=gateway
PUBLIC_IP=${publicIp}
CERTBOT_EMAIL=${certificateEmail}
NPM_REGISTRY=https://registry.npmjs.org
APP_TIME_ZONE=Asia/Shanghai
AUTH_ACCESS_TOKEN_SECRET=${authSecret}
AUTH_ACCESS_TOKEN_ISSUER=makeup-booking-api
AUTH_ACCESS_TOKEN_AUDIENCE=makeup-booking-clients
INTERNAL_WORKER_TOKEN=${workerToken}

POSTGRES_DB=makeup_booking
POSTGRES_USER=makeup
POSTGRES_PASSWORD=${postgresPassword}
DATABASE_URL=postgresql://makeup:${postgresPassword}@postgres:5432/makeup_booking?schema=public
BACKUP_DATABASE_URL=postgresql://makeup:${postgresPassword}@postgres:5432/makeup_booking

REDIS_PASSWORD=${redisPassword}
REDIS_URL=redis://:${redisPassword}@redis:6379

BOOKING_MAINTENANCE_INTERVAL_MS=60000
EXPORT_POLL_INTERVAL_MS=5000
EXPORT_CLEANUP_INTERVAL_MS=3600000
`;

writeFileSync(target, environment, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
console.log(`单机部署配置已创建：${target}`);
