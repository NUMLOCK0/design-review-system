import { readFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// JWT signing and verification always use the value in apps/server/.env.
// Do not allow PM2/systemd process variables to silently override this key.
const envPath = path.resolve(process.cwd(), '.env');
let fileSecret = '';
try {
  fileSecret = String(dotenv.parse(readFileSync(envPath, 'utf8')).JWT_SECRET || '').trim();
} catch (error) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`无法读取 ${envPath} 中的 JWT_SECRET`);
  }
}

if (process.env.NODE_ENV === 'production' && fileSecret.length < 32) {
  throw new Error(`${envPath} 必须配置至少 32 位 JWT_SECRET`);
}

export const JWT_SECRET = fileSecret || 'local-development-secret-change-me';
