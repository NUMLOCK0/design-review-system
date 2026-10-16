import assert from 'node:assert/strict';
import { test } from 'node:test';
import Ajv from 'ajv';
import { buildFormSchema, createFormField } from '@design-review/shared';

test('upload field enforces a finite count and accepts legacy single URLs', () => {
  const field = { ...createFormField('image', 1), required: true, maxFiles: 2 };
  const validate = new Ajv({ strict: false }).compile(buildFormSchema([field]).schema);
  assert.equal(validate({ [field.key]: '/api/upload/previews/one' }), true);
  assert.equal(validate({ [field.key]: ['/api/upload/previews/one', '/api/upload/previews/two'] }), true);
  assert.equal(validate({ [field.key]: ['/api/upload/previews/one', '/api/upload/previews/two', '/api/upload/previews/three'] }), false);
  assert.equal(validate({ [field.key]: [] }), false);
});

test('unlimited upload field has no form-level item limit', () => {
  const field = { ...createFormField('file', 1), maxFiles: null };
  const validate = new Ajv({ strict: false }).compile(buildFormSchema([field]).schema);
  assert.equal(validate({ [field.key]: Array.from({ length: 1001 }, (_, index) => `/api/upload/assets/${index}`) }), true);
});
