import crypto from 'crypto';
import https from 'https';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import * as tencentcloudModule from 'tencentcloud-sdk-nodejs';
import nodemailer from 'nodemailer';

const CAPTCHA_SECRET = process.env.JWT_SECRET || 'design-review-secret-key-2026';
const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const SMS_TTL_MS = 5 * 60 * 1000;
const SMS_EXPIRE_MINUTES = SMS_TTL_MS / (60 * 1000);
const SMS_INTERVAL_MS = 60 * 1000;

type SliderPayload = { x?: unknown; y?: unknown; duration?: unknown; trail?: unknown };
type CaptchaState = { targetX: number; expiresAt: number; used: boolean };
type SmsPurpose = 'login' | 'register' | 'reset';
type SmsState = { hash: string; purpose: SmsPurpose; expiresAt: number; sentAt: number };
type EmailPurpose = 'register' | 'reset';
type EmailState = { hash: string; purpose: EmailPurpose; expiresAt: number; sentAt: number };

const challenges = new Map<string, CaptchaState>();
const verifiedTokens = new Map<string, number>();
const smsCodes = new Map<string, SmsState>();
const emailCodes = new Map<string, EmailState>();

export function normalizePhone(phone: string) {
  return phone.trim().replace(/^\+86/, '');
}

export function isValidPhone(phone: string) {
  return PHONE_PATTERN.test(normalizePhone(phone));
}

function cleanup() {
  const now = Date.now();
  for (const [id, item] of challenges) if (item.expiresAt <= now || item.used) challenges.delete(id);
  for (const [token, expiresAt] of verifiedTokens) if (expiresAt <= now) verifiedTokens.delete(token);
  for (const [phone, item] of smsCodes) if (item.expiresAt <= now) smsCodes.delete(phone);
  for (const [email, item] of emailCodes) if (item.expiresAt <= now) emailCodes.delete(email);
}

function dataUrl(buffer: Buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function captchaImages(targetX: number) {
  const background = `<svg width="320" height="160" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#172554"/><stop offset=".55" stop-color="#2563eb"/><stop offset="1" stop-color="#06b6d4"/></linearGradient>
      <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#fff" stroke-opacity=".1"/></pattern>
    </defs>
    <rect width="320" height="160" fill="url(#bg)"/><rect width="320" height="160" fill="url(#grid)"/>
    <circle cx="45" cy="45" r="30" fill="#fff" fill-opacity=".12"/><circle cx="275" cy="120" r="48" fill="#fff" fill-opacity=".1"/>
    <text x="18" y="28" fill="#fff" fill-opacity=".7" font-family="Arial" font-size="11" font-weight="700">COZI HUMAN CHECK</text>
    <rect x="${targetX}" y="55" width="56" height="56" rx="10" fill="#0f172a" fill-opacity=".32" stroke="#fff" stroke-opacity=".8" stroke-width="2" stroke-dasharray="5 4"/>
  </svg>`;
  const puzzle = `<svg width="56" height="56" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="52" height="52" rx="10" fill="#fff" fill-opacity=".9" stroke="#1d4ed8" stroke-width="2"/>
    <circle cx="28" cy="28" r="10" fill="#2563eb" fill-opacity=".18"/><path d="M20 28h16M28 20v16" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
  const [backgroundPng, puzzlePng] = await Promise.all([
    sharp(Buffer.from(background)).png().toBuffer(),
    sharp(Buffer.from(puzzle)).png().toBuffer()
  ]);
  return { bgUrl: dataUrl(backgroundPng), puzzleUrl: dataUrl(puzzlePng) };
}

export async function createSliderChallenge() {
  cleanup();
  const id = crypto.randomUUID();
  const targetX = 92 + Math.floor(Math.random() * 150);
  challenges.set(id, { targetX, expiresAt: Date.now() + CAPTCHA_TTL_MS, used: false });
  return { challengeId: id, ...(await captchaImages(targetX)) };
}

export function verifySliderChallenge(challengeId: string, payload: SliderPayload) {
  cleanup();
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.expiresAt <= Date.now() || challenge.used) throw new Error('滑块验证码已失效，请重新验证');
  const x = Number(payload.x);
  const duration = Number(payload.duration);
  const trail = Array.isArray(payload.trail) ? payload.trail : [];
  if (!Number.isFinite(x) || Math.abs(x - challenge.targetX) > 9 || duration < 250 || trail.length < 3) {
    throw new Error('滑块位置不正确，请重试');
  }
  challenge.used = true;
  const token = jwt.sign({ kind: 'sms-captcha', challengeId }, CAPTCHA_SECRET, { expiresIn: '5m' });
  verifiedTokens.set(token, Date.now() + CAPTCHA_TTL_MS);
  return token;
}

export function consumeSliderToken(captchaToken: string) {
  const tokenExpiresAt = verifiedTokens.get(captchaToken);
  if (!tokenExpiresAt || tokenExpiresAt <= Date.now()) throw new Error('请先完成滑块验证');
  verifiedTokens.delete(captchaToken);
}

function smsClient() {
  // The SDK is CommonJS while the server runs as ESM. Depending on the
  // loader, the SDK can be exposed either as the namespace or under default.
  const sdk = (tencentcloudModule as any)?.default ?? (tencentcloudModule as any);
  const Client = sdk?.sms?.v20190711?.Client;
  if (!Client) throw new Error('腾讯云短信 SDK 加载失败');
  if (!process.env.TENCENTCLOUD_SECRET_ID || !process.env.TENCENTCLOUD_SECRET_KEY || !process.env.TENCENTCLOUD_SMS_APP_ID || !process.env.TENCENTCLOUD_SMS_SIGN_NAME || !process.env.TENCENTCLOUD_SMS_TEMPLATE_ID) {
    throw new Error('腾讯云短信服务未配置，请先填写短信服务配置');
  }
  return new Client({
    credential: { secretId: process.env.TENCENTCLOUD_SECRET_ID, secretKey: process.env.TENCENTCLOUD_SECRET_KEY },
    region: process.env.TENCENTCLOUD_SMS_REGION || 'ap-guangzhou',
    // 腾讯云 SDK 旧版代理适配器在 Node 22 下会把 HTTPS 请求交给 HTTP agent。
    // 显式使用原生 HTTPS agent，避免本机代理导致 Protocol 不匹配。
    profile: { httpProfile: { endpoint: 'sms.tencentcloudapi.com', reqTimeout: 10, agent: new https.Agent({ keepAlive: true }) } }
  });
}

export async function sendSmsCode(phoneInput: string, captchaToken: string, purpose: SmsPurpose) {
  cleanup();
  const phone = normalizePhone(phoneInput);
  if (!isValidPhone(phone)) throw new Error('请输入有效的中国大陆手机号');
  consumeSliderToken(captchaToken);
  const previous = smsCodes.get(phone);
  if (previous && Date.now() - previous.sentAt < SMS_INTERVAL_MS) throw new Error('验证码发送过于频繁，请稍后再试');

  const code = String(100000 + Math.floor(Math.random() * 900000));
  const client = smsClient();
  const result = await client.SendSms({
    SmsSdkAppid: process.env.TENCENTCLOUD_SMS_APP_ID,
    Sign: process.env.TENCENTCLOUD_SMS_SIGN_NAME,
    TemplateID: process.env.TENCENTCLOUD_SMS_TEMPLATE_ID,
    PhoneNumberSet: [`+86${phone}`],
    TemplateParamSet: [code, String(SMS_EXPIRE_MINUTES)]
  });
  const status = result?.SendStatusSet?.[0];
  if (status && status.Code !== 'Ok') throw new Error(status.Message || '腾讯云短信发送失败');
  smsCodes.set(phone, { hash: crypto.createHash('sha256').update(code).digest('hex'), purpose, expiresAt: Date.now() + SMS_TTL_MS, sentAt: Date.now() });
  return { expiresIn: SMS_TTL_MS / 1000 };
}

export function consumeSmsCode(phoneInput: string, code: string, purpose: SmsPurpose) {
  cleanup();
  const phone = normalizePhone(phoneInput);
  const item = smsCodes.get(phone);
  if (!item || item.purpose !== purpose || item.expiresAt <= Date.now()) throw new Error('验证码不存在或已过期');
  const actual = crypto.createHash('sha256').update(String(code)).digest('hex');
  if (actual !== item.hash) throw new Error('验证码错误');
  smsCodes.delete(phone);
  return true;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_INTERVAL_MS = 60 * 1000;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function emailClient() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error('邮箱服务未配置，请先填写 SMTP_HOST、SMTP_USER、SMTP_PASS');
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') !== 'false',
    auth: { user, pass }
  });
}

export async function sendEmailCode(emailInput: string, captchaToken: string, purpose: EmailPurpose) {
  cleanup();
  const email = normalizeEmail(emailInput);
  if (!EMAIL_PATTERN.test(email)) throw new Error('请输入有效的邮箱地址');
  consumeSliderToken(captchaToken);
  const previous = emailCodes.get(email);
  if (previous && Date.now() - previous.sentAt < EMAIL_INTERVAL_MS) throw new Error('验证码发送过于频繁，请稍后再试');

  const code = String(100000 + Math.floor(Math.random() * 900000));
  await emailClient().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: purpose === 'register' ? '创赢注册验证码' : '创赢密码重置验证码',
    text: `您的验证码是：${code}\n验证码将在${SMS_EXPIRE_MINUTES}分钟后失效，请及时完成操作。`,
    html: `<p>您的验证码是：<strong style="font-size:22px;letter-spacing:4px">${code}</strong></p><p>验证码将在 ${SMS_EXPIRE_MINUTES} 分钟后失效，请及时完成操作。</p>`
  });
  emailCodes.set(email, { hash: crypto.createHash('sha256').update(code).digest('hex'), purpose, expiresAt: Date.now() + SMS_TTL_MS, sentAt: Date.now() });
  return { expiresIn: SMS_TTL_MS / 1000 };
}

export function consumeEmailCode(emailInput: string, code: string, purpose: EmailPurpose) {
  cleanup();
  const email = normalizeEmail(emailInput);
  const item = emailCodes.get(email);
  if (!item || item.purpose !== purpose || item.expiresAt <= Date.now()) throw new Error('验证码不存在或已过期');
  const actual = crypto.createHash('sha256').update(String(code)).digest('hex');
  if (actual !== item.hash) throw new Error('验证码错误');
  emailCodes.delete(email);
  return true;
}
