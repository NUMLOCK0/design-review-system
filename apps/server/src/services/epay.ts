import crypto from 'node:crypto';

type EpayFields = Record<string, string | number | undefined>;

const compact = (value: unknown) => value !== undefined && value !== null && String(value) !== '';

export function signEpay(fields: EpayFields, key: string) {
  const query = Object.entries(fields)
    .filter(([name, value]) => name !== 'sign' && name !== 'sign_type' && compact(value))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
  return crypto.createHash('md5').update(`${query}${key}`).digest('hex').toLowerCase();
}

export function verifyEpaySign(fields: EpayFields, sign: string | undefined, key: string) {
  if (!sign) return false;
  const expected = signEpay(fields, key);
  const actual = Buffer.from(String(sign).toLowerCase());
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}

export const money = (value: number) => Number(Number(value).toFixed(2));

const gatewayRoot = () => {
  const value = String(process.env.EPAY_GATEWAY_URL || '').trim().replace(/\/+$/, '');
  if (!value) throw new Error('Epay 支付网关未配置，请设置 EPAY_GATEWAY_URL');
  return value.replace(/\/(?:mapi|submit|api)\.php$/i, '');
};

export function createEpayCheckout(input: {
  outTradeNo: string;
  name: string;
  amount: number;
  param: string;
}) {
  const pid = String(process.env.EPAY_PID || '').trim();
  const key = String(process.env.EPAY_KEY || '').trim();
  if (!pid || !key) throw new Error('Epay 商户配置不完整，请设置 EPAY_PID 与 EPAY_KEY');

  const publicApiOrigin = String(process.env.PUBLIC_API_ORIGIN || 'http://localhost:8080').replace(/\/+$/, '');
  const fields: EpayFields = {
    pid,
    type: process.env.EPAY_PAYMENT_TYPE || 'wxpay',
    out_trade_no: input.outTradeNo,
    name: input.name,
    money: money(input.amount).toFixed(2),
    notify_url: process.env.EPAY_NOTIFY_URL || `${publicApiOrigin}/api/payments/epay/notify`,
    return_url: process.env.EPAY_RETURN_URL || `${publicApiOrigin}/api/payments/epay/return`,
    param: input.param,
    device: process.env.EPAY_DEVICE || 'pc',
    sign_type: 'MD5',
  };
  return {
    action: `${gatewayRoot()}/submit.php`,
    method: 'POST' as const,
    fields: { ...fields, sign: signEpay(fields, key) },
  };
}

export async function createEpayApiCheckout(input: {
  outTradeNo: string;
  name: string;
  amount: number;
  param: string;
  type: 'wxpay' | 'alipay';
}) {
  const pid = String(process.env.EPAY_PID || '').trim();
  const key = String(process.env.EPAY_KEY || '').trim();
  if (!pid || !key) throw new Error('Epay 商户配置不完整，请设置 EPAY_PID 与 EPAY_KEY');

  const publicApiOrigin = String(process.env.PUBLIC_API_ORIGIN || 'http://localhost:8080').replace(/\/+$/, '');
  const fields: EpayFields = {
    pid,
    type: input.type,
    out_trade_no: input.outTradeNo,
    name: input.name,
    money: money(input.amount).toFixed(2),
    notify_url: process.env.EPAY_NOTIFY_URL || `${publicApiOrigin}/api/payments/epay/notify`,
    return_url: process.env.EPAY_RETURN_URL || `${publicApiOrigin}/api/payments/epay/return`,
    param: input.param,
    device: process.env.EPAY_DEVICE || 'pc',
    sign_type: 'MD5'
  };

  const response = await fetch(`${gatewayRoot()}/mapi.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.entries({ ...fields, sign: signEpay(fields, key) }).reduce<Record<string, string>>((result, [name, value]) => {
      if (value !== undefined && value !== null) result[name] = String(value);
      return result;
    }, {}))
  });
  const result = await response.json().catch(() => null) as { code?: number; msg?: string; trade_no?: string; o_id?: string; qrcode?: string; payurl?: string } | null;
  if (!response.ok || !result || Number(result.code) !== 1 || !result.qrcode) {
    throw new Error(result?.msg || '支付网关下单失败，未返回支付二维码');
  }
  return { tradeNo: result.trade_no || result.o_id || '', qrcode: result.qrcode, payurl: result.payurl || '' };
}

export function expectedEpayGatewayAmount(value: unknown) {
  return money(Number(value));
}
