import assert from 'node:assert/strict';
import test from 'node:test';
import { aiResponseError, sanitizeAiError } from './services/ai-call-log.js';

test('AI error logs redact keys, URLs and encoded image payloads', () => {
  const secret = 'private-provider-key-123456789';
  const message = `Bearer ${secret} api_key=${secret} https://provider.example/v1?token=${secret} data:image/png;base64,${'A'.repeat(100)}`;
  const safe = sanitizeAiError(message, secret);
  assert.doesNotMatch(safe, /private-provider-key|provider\.example|AAAA/);
  assert.match(safe, /已隐藏凭证/);
  assert.match(safe, /已隐藏地址/);
  assert.match(safe, /已隐藏图片/);
});

test('AI error logs retain a short actionable provider message', () => {
  assert.equal(sanitizeAiError('模型不存在，请检查模型名称'), '模型不存在，请检查模型名称');
});

test('HTTP and business-level upstream errors are classified', () => {
  assert.deepEqual(aiResponseError(429, { error: { code: 'rate_limit', message: '请求过多' } }), { code: 'rate_limit', message: '请求过多' });
  assert.deepEqual(aiResponseError(200, { state: 'failed', error: '生成失败' }), { code: 'UPSTREAM_REPORTED_ERROR', message: '生成失败' });
  assert.deepEqual(aiResponseError(200, { success: false, message: '余额不足' }), { code: 'UPSTREAM_REPORTED_ERROR', message: '余额不足' });
  assert.equal(aiResponseError(200, { choices: [] }), null);
  assert.equal(aiResponseError(204, null), null);
});
