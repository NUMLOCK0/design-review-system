#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = join(root, '.cache', 'dev-stack');
const webDir = join(root, 'apps', 'web');
const uniDir = join(root, 'apps', 'uni-app');
const localApi = 'http://127.0.0.1:8080/api';
const services = [
  { name: 'server', cwd: join(root, 'apps', 'server'), cli: 'node_modules/tsx/dist/cli.mjs', args: ['watch', 'src/server.ts'], url: `${localApi}/health`, env: { NODE_ENV: 'development' } },
  { name: 'web', cwd: webDir, cli: 'node_modules/next/dist/bin/next', args: ['dev', '-p', '3000'], url: 'http://127.0.0.1:3000/login', env: { NODE_ENV: 'development', API_PROXY_TARGET: 'http://127.0.0.1:8080' } },
  { name: 'h5', cwd: uniDir, cli: 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js', args: [], url: 'http://127.0.0.1:5173/', env: { NODE_ENV: 'development', VITE_API_BASE_URL: localApi } },
  { name: 'mini', cwd: uniDir, cli: 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js', args: ['-p', 'mp-weixin'], artifact: join(uniDir, 'dist/dev/mp-weixin/app.json'), env: { NODE_ENV: 'development', VITE_API_BASE_URL: localApi } },
];

function paths(service) {
  return { pid: join(stateDir, `${service.name}.json`), log: join(stateDir, `${service.name}.log`) };
}

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 2) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function owned(service) {
  const path = paths(service).pid;
  if (!existsSync(path)) return null;
  try {
    const record = JSON.parse(readFileSync(path, 'utf8'));
    if (record.cli !== resolve(service.cwd, service.cli) || !alive(record.pid)) return null;
    if (process.platform !== 'win32') {
      const command = execFileSync('ps', ['-p', String(record.pid), '-o', 'command='], { encoding: 'utf8' });
      if (!command.includes(record.cli)) return null;
    }
    return record;
  } catch { return null; }
}

async function probe(service, record) {
  if (!record) return false;
  if (service.artifact) {
    try { return statSync(service.artifact).mtimeMs >= record.startedAt - 2000; } catch { return false; }
  }
  try {
    const response = await fetch(service.url, { signal: AbortSignal.timeout(2500), redirect: 'follow' });
    return response.ok;
  } catch { return false; }
}

function launch(service) {
  const cli = resolve(service.cwd, service.cli);
  if (!existsSync(cli)) throw new Error(`缺少依赖：${cli}，请先运行 pnpm install`);
  const { pid, log } = paths(service);
  const logFd = openSync(log, 'a', 0o600);
  let child;
  try {
    child = spawn(process.execPath, [cli, ...service.args], {
      cwd: service.cwd,
      env: { ...process.env, ...service.env },
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
  } finally { closeSync(logFd); }
  child.unref();
  const record = { pid: child.pid, cli, startedAt: Date.now() };
  writeFileSync(pid, JSON.stringify(record), { mode: 0o600 });
  console.log(`启动 ${service.name} (PID ${child.pid})，日志：${log}`);
  return record;
}

async function waitReady(service, record, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (!owned(service)) throw new Error(`${service.name} 已退出；查看 ${paths(service).log}`);
    if (await probe(service, record)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
  }
  throw new Error(`${service.name} 启动超时；查看 ${paths(service).log}`);
}

async function up() {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  for (const service of services) {
    let record = owned(service);
    if (!record) {
      const { pid } = paths(service);
      if (existsSync(pid)) rmSync(pid);
      record = launch(service);
    } else {
      console.log(`${service.name} 已运行 (PID ${record.pid})`);
    }
    await waitReady(service, record);
    console.log(`${service.name} 已就绪${service.url ? `：${service.url}` : `：${service.artifact}`}`);
  }
}

async function stop(service) {
  const record = owned(service);
  const { pid } = paths(service);
  if (!record) {
    if (existsSync(pid)) rmSync(pid);
    return;
  }
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(record.pid), '/T', '/F']); } catch { /* already exited */ }
  } else {
    try { process.kill(-record.pid, 'SIGTERM'); } catch { /* already exited */ }
    for (let i = 0; i < 20 && alive(record.pid); i++) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    if (owned(service)) {
      try { process.kill(-record.pid, 'SIGKILL'); } catch { /* already exited */ }
    }
  }
  rmSync(pid, { force: true });
  console.log(`已停止 ${service.name}`);
}

async function down() {
  for (const service of [...services].reverse()) await stop(service);
}

async function status() {
  let failed = false;
  for (const service of services) {
    const record = owned(service);
    const ready = await probe(service, record);
    console.log(`${service.name}: ${ready ? '可访问' : record ? '运行中，尚未就绪' : '未运行'}${record ? ` (PID ${record.pid})` : ''}${service.url ? ` ${service.url}` : ''}`);
    if (!ready) failed = true;
  }
  if (failed) process.exitCode = 1;
}

const command = process.argv[2];
try {
  if (command === 'up') await up();
  else if (command === 'down') await down();
  else if (command === 'status') await status();
  else if (command === 'restart') {
    await down();
    rmSync(join(webDir, '.next-dev'), { recursive: true, force: true });
    await up();
  } else {
    console.error('用法：pnpm dev:up | dev:down | dev:status | dev:restart');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
