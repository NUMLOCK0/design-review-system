#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = join(root, 'apps/server');
const envPath = join(serverDir, '.env');
const serverRequire = createRequire(join(serverDir, 'package.json'));
const dotenv = serverRequire('dotenv');
const mysql = serverRequire('mysql2/promise');

function optionsFromArgs(args) {
  const options = { checkOnly: false, attempts: 5, delayMs: 2000, timeoutMs: 30000 };
  const ranges = { attempts: [1, 20], delayMs: [0, 60000], timeoutMs: [1000, 60000] };
  for (const arg of args) {
    if (arg === '--check') { options.checkOnly = true; continue; }
    const match = /^--(attempts|delay-ms|timeout-ms)=(\d+)$/.exec(arg);
    if (!match) throw new Error(`未知参数：${arg}`);
    const key = match[1] === 'delay-ms' ? 'delayMs' : match[1] === 'timeout-ms' ? 'timeoutMs' : 'attempts';
    const value = Number(match[2]);
    if (value < ranges[key][0] || value > ranges[key][1]) throw new Error(`${match[1]} 超出范围`);
    options[key] = value;
  }
  return options;
}

const sleep = (duration) => new Promise((done) => setTimeout(done, duration));

function portIsBusy(port) {
  return new Promise((done) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); done(true); });
    socket.once('error', () => done(false));
    socket.once('timeout', () => { socket.destroy(); done(false); });
  });
}

async function retryMysql(url, { attempts, delayMs, timeoutMs }) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let connection;
    try {
      connection = await mysql.createConnection({ uri: url, connectTimeout: timeoutMs });
      await connection.query({ sql: 'SELECT 1', timeout: timeoutMs });
      console.log(`MySQL 连接和查询成功（第 ${attempt}/${attempts} 次）。`);
      return true;
    } catch (error) {
      // 不输出连接串或驱动错误全文，避免密码出现在终端日志中。
      const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
      console.error(`MySQL 第 ${attempt}/${attempts} 次连接失败：${code}`);
      if (attempt < attempts) {
        const waitMs = Math.min(delayMs * attempt, 10000);
        console.log(`${waitMs} ms 后重试…`);
        await sleep(waitMs);
      }
    } finally {
      connection?.destroy();
    }
  }
  return false;
}

async function main() {
  const options = optionsFromArgs(process.argv.slice(2));
  let file;
  try { file = readFileSync(envPath); }
  catch { throw new Error(`无法读取 ${envPath}`); }
  const values = dotenv.parse(file);
  const url = values.MYSQL_URL?.trim();
  if (!url) throw new Error('apps/server/.env 中未配置 MYSQL_URL');
  const connected = await retryMysql(url, options);
  if (!connected) {
    console.error('MySQL 重试耗尽；后端未切换到内存模式。请检查数据库服务、地址和 3306 网络放行。');
    process.exitCode = 1;
    return;
  }
  if (options.checkOnly) return;
  const port = Number(values.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('apps/server/.env 中的 PORT 无效');
  if (await portIsBusy(port)) throw new Error(`端口 ${port} 已被占用，请先停止旧后端服务`);

  // 本地开发始终使用非 Secure Cookie；其他配置仍来自 .env。
  const env = { ...process.env, ...values, NODE_ENV: 'development' };
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  console.log('启动后端开发服务…');
  const child = spawn(command, ['dev:server'], { cwd: root, env, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', (error) => { console.error(`启动后端失败：${error.code || 'UNKNOWN'}`); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
