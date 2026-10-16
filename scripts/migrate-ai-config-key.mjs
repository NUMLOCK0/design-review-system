#!/usr/bin/env node
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = join(root, 'apps', 'server');
const requireServer = createRequire(join(serverDir, 'package.json'));
const dotenv = requireServer('dotenv');
const mysql = requireServer('mysql2/promise');
const configured = dotenv.parse(readFileSync(join(serverDir, '.env')));
const example = dotenv.parse(readFileSync(join(serverDir, '.env.example')));
const currentSecret = process.env.AI_CONFIG_ENCRYPTION_KEY || configured.AI_CONFIG_ENCRYPTION_KEY
  || process.env.JWT_SECRET || configured.JWT_SECRET || 'local-development-secret-change-me';
const previousSecret = process.argv.includes('--from-example-jwt')
  ? example.JWT_SECRET : process.env.AI_CONFIG_PREVIOUS_ENCRYPTION_KEY;
const mysqlUrl = process.env.MYSQL_URL || configured.MYSQL_URL;

if (!previousSecret || !mysqlUrl || currentSecret.length < 32 || currentSecret === previousSecret) {
  throw new Error('迁移条件不满足：需要旧密钥、数据库地址，以及不同于旧密钥的稳定新密钥（至少 32 字符）');
}

function key(secret, purpose = 'design-review-ai-config-v1') {
  return createHash('sha256').update(`${purpose}:${secret}`).digest();
}

function decrypt(encoded, secret) {
  try {
    const payload = Buffer.from(encoded, 'base64');
    if (payload.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(secret), payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
    return plain.length ? plain : null;
  } catch { return null; }
}

function encrypt(plain, secret, purpose = 'design-review-ai-config-v1') {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret, purpose), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

const pool = mysql.createPool({ uri: mysqlUrl, connectionLimit: 1 });
let connection;
let backupPath = '';
const plaintexts = [];
try {
  connection = await pool.getConnection();
  await connection.beginTransaction();
  const [rows] = await connection.query('SELECT id,api_key_encrypted FROM ai_model_configs FOR UPDATE');
  const updates = [];
  for (const row of rows) {
    const currentPlain = decrypt(row.api_key_encrypted, currentSecret);
    if (currentPlain) { currentPlain.fill(0); continue; }
    const previousPlain = decrypt(row.api_key_encrypted, previousSecret);
    if (!previousPlain) throw new Error('存在无法用旧密钥或新密钥解密的配置；未修改数据库');
    plaintexts.push(previousPlain);
    updates.push({ id: row.id, original: row.api_key_encrypted, plain: previousPlain });
  }
  if (!updates.length) {
    await connection.rollback();
    console.log('全部配置已使用当前密钥，无需迁移');
  } else {
    const backupDir = resolve(root, '.cache', 'ai-config-migration');
    if (!backupDir.startsWith(root + sep)) throw new Error('备份目录不在项目内');
    mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    backupPath = join(backupDir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.json`);
    if (existsSync(backupPath)) throw new Error('备份文件已存在');
    const archive = Buffer.from(JSON.stringify({ createdAt: new Date().toISOString(), rows: rows.map(row => ({ id: row.id, api_key_encrypted: row.api_key_encrypted })) }));
    const backupPayload = encrypt(archive, currentSecret, 'design-review-ai-config-backup-v1');
    archive.fill(0);
    writeFileSync(backupPath, JSON.stringify({ version: 1, algorithm: 'aes-256-gcm', payload: backupPayload }), { flag: 'wx', mode: 0o600 });
    for (const update of updates) {
      const replacement = encrypt(update.plain, currentSecret);
      const verified = decrypt(replacement, currentSecret);
      if (!verified || !verified.equals(update.plain)) throw new Error('新密文校验失败');
      verified.fill(0);
      const [result] = await connection.execute('UPDATE ai_model_configs SET api_key_encrypted=? WHERE id=? AND api_key_encrypted=?', [replacement, update.id, update.original]);
      if (result.affectedRows !== 1) throw new Error('配置已被并发修改，迁移终止');
    }
    const [verifiedRows] = await connection.query('SELECT id,api_key_encrypted FROM ai_model_configs');
    for (const row of verifiedRows) {
      const plain = decrypt(row.api_key_encrypted, currentSecret);
      if (!plain) throw new Error('迁移后的配置校验失败');
      plain.fill(0);
    }
    await connection.commit();
    console.log(JSON.stringify({ migrated: updates.length, verified: verifiedRows.length, encryptedBackup: backupPath }));
  }
} catch (error) {
  if (connection) await connection.rollback().catch(() => undefined);
  console.error(JSON.stringify({ migrationFailed: true, code: error?.code || 'VALIDATION_FAILED', encryptedBackup: backupPath || null }));
  process.exitCode = 1;
} finally {
  for (const plain of plaintexts) plain.fill(0);
  connection?.release();
  await pool.end();
}
