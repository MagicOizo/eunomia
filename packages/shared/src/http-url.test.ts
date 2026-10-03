import assert from 'node:assert/strict';
import test from 'node:test';

import { isHttpUrl } from './http-url.js';

/** The schemes the security review demonstrated against zod 3.25.76 (SEC-01). */
test('the executable and local schemes are refused', () => {
  assert.equal(isHttpUrl('javascript:alert(document.domain)'), false);
  assert.equal(isHttpUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isHttpUrl('vbscript:msgbox(1)'), false);
  assert.equal(isHttpUrl('file:///etc/passwd'), false);
});

test('an absolute http(s) address is accepted, whatever its case', () => {
  assert.equal(isHttpUrl('https://ok.example/doc.pdf'), true);
  assert.equal(isHttpUrl('http://ok.example/doc.pdf'), true);
  assert.equal(isHttpUrl('HTTPS://OK.example/doc.pdf'), true);
});

test('what the URL parser cannot read is refused, not thrown', () => {
  assert.equal(isHttpUrl(''), false);
  assert.equal(isHttpUrl('/invoices/42.pdf'), false);
  assert.equal(isHttpUrl('ok.example/doc.pdf'), false);
});

test('a value that is not a string is refused', () => {
  assert.equal(isHttpUrl(undefined), false);
  assert.equal(isHttpUrl(null), false);
  assert.equal(isHttpUrl(42), false);
});
