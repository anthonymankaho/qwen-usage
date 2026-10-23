'use strict';
// Run with: node test.js
const assert = require('node:assert/strict');
const { parseCurl } = require('./curl-parser');
const { parseUsage } = require('./usage-parser');

// --- curl parser ---
const c1 = parseCurl(
  `curl 'https://cs-data.qwencloud.com/data/api.json?action=IntlBroadScopeAspnGateway' \\\n` +
    `  -H 'accept: application/json, text/plain, */*' \\\n` +
    `  -H 'cookie: login_aliyunid_ticket=abc123; sec_token=xyz' \\\n` +
    `  -H 'content-type: application/x-www-form-urlencoded' \\\n` +
    `  --data-raw 'product=sfm_bailian&region=ap-southeast-1' \\\n` +
    `  --compressed`
);
assert.equal(c1.method, 'POST');
assert.equal(c1.url, 'https://cs-data.qwencloud.com/data/api.json?action=IntlBroadScopeAspnGateway');
assert.equal(c1.headers['accept'], 'application/json, text/plain, */*');
assert.equal(c1.headers['cookie'], 'login_aliyunid_ticket=abc123; sec_token=xyz');
assert.equal(c1.body, 'product=sfm_bailian&region=ap-southeast-1');

const c2 = parseCurl(`curl "https://home.qwencloud.com/personal/api/v2/usage" -H "cookie: a=b" --compressed -s`);
assert.equal(c2.method, 'GET');
assert.equal(c2.body, null);
assert.equal(c2.headers['cookie'], 'a=b');

assert.throws(() => parseCurl('wget https://example.com'));
assert.throws(() => parseCurl("curl 'notaurl'"));

// --- usage parser: console-like envelope ---
const u1 = parseUsage({
  code: '200',
  data: {
    monthlyQuota: { remainingPercent: 86.5, remainingQuota: 25500, planQuota: 29480 },
    remainingDays: 82,
    resetTime: '2026-11-14 00:00:00',
    expireTime: 1799884800000,
  },
});
assert.equal(u1.ok, true);
assert.equal(u1.percent, 86.5);
assert.equal(u1.remaining, 25500);
assert.equal(u1.total, 29480);
assert.equal(u1.daysLeft, 82);
// 'YYYY-MM-DD HH:mm:ss' parses as local wall-clock time (which is what the
// tooltip formats back to), so compare against local midnight, not UTC.
assert.equal(u1.resetAt, new Date(2026, 10, 14, 0, 0, 0).getTime());
assert.equal(u1.expiryAt, 1799884800000);

// --- usage parser: CodexBar-style flat keys ---
const u2 = parseUsage({ credit_value: 25500, NextCycleFlushTime: 1763049600000, usage_rate: 13.5 });
assert.equal(u2.ok, true);
assert.equal(u2.remaining, 25500);
assert.equal(u2.percent, 86.5);
assert.equal(u2.resetAt, 1763049600000);

// --- usage parser: ratio form + derived remaining ---
const u3 = parseUsage({ data: { remaining_ratio: 0.865, total_credits: 29480 } });
assert.equal(u3.percent, 86.5);
assert.equal(u3.remaining, 29480 * 0.865);

// --- usage parser: string JSON + epoch seconds ---
const u4 = parseUsage('{"remainingPercent":"72.0","resetTime":1763049600}');
assert.equal(u4.percent, 72);
assert.equal(u4.resetAt, 1763049600000);

// --- usage parser: real console shape (HAR-verified 2026-10-23) ---
const u5 = parseUsage({
  code: '200',
  data: {
    DataV2: {
      data: {
        code: 'SUCCESS',
        data: {
          instanceCode: 'sfm_tokenplansolo_public_intl-sg-x',
          specCode: 'essential',
          remainingDays: 82,
          startTime: 1763049600000,
          endTime: 1799884800000,
          equityList: [
            { cycleTotalValue: 25500, cycleSurplusValue: 22057.5, cycleTotalDays: 30, cycleEndTime: '2026-11-14T00:00:00Z' },
          ],
          essential: { five_hour: 1800.0, monthly: 25500.0 },
          addon_quota: { extrabundle: 20000.0 },
        },
      },
    },
  },
});
assert.equal(u5.ok, true);
assert.equal(u5.remaining, 22057.5);
assert.equal(u5.total, 25500); // cycleTotalValue, not cycleTotalDays
assert.equal(u5.percent, 86.5);
assert.equal(u5.daysLeft, 82);
assert.equal(u5.expiryAt, 1799884800000); // instance endTime, not cycleEndTime
assert.ok(u5.resetAt && u5.resetAt === Date.parse('2026-11-14T00:00:00Z'));

// --- usage parser: real /usage endpoint shape (HAR-verified 2026-10-23) ---
const u6 = parseUsage({
  code: '200',
  data: {
    DataV2: {
      data: {
        code: 'SUCCESS',
        data: { per1MonthPercentage: 0.1606259683110157, per1MonthResetTime: 1794585600000 },
      },
    },
  },
});
assert.equal(u6.ok, true);
assert.ok(Math.abs(u6.percent - (100 - 16.06259683110157)) < 1e-9);
assert.equal(u6.resetAt, 1794585600000);

// --- merge across the three console endpoints ---
const { mergeUsages } = require('./usage-parser');
const m1 = mergeUsages([
  u6,
  { ok: false, percent: null, remaining: null, total: null, resetAt: null, expiryAt: 1799884800000, daysLeft: 82, spec: 'essential', monthlyBySpec: null, matched: [] },
  { ok: false, percent: null, remaining: null, total: null, resetAt: null, expiryAt: null, daysLeft: null, spec: null, monthlyBySpec: { essential: 25500, pro: 180000 }, matched: [] },
]);
assert.equal(m1.spec, 'essential');
assert.equal(m1.total, 25500); // tier picked by specCode, not pro
assert.ok(Math.abs(m1.remaining - (25500 * (100 - 16.06259683110157)) / 100) < 1e-6);
assert.equal(m1.daysLeft, 82);
assert.equal(m1.expiryAt, 1799884800000);
assert.equal(m1.resetAt, 1794585600000);

// --- usage parser: session expiry and TotalCount must not pollute (HAR 2026-10-23) ---
const u7 = parseUsage({
  data: {
    sessionExpireTimeStamp: 1794530132678,
    secToken: 'x',
    Data: { TotalCount: 1, PageNum: 1, PageSize: 20, InstanceList: [{ EndTime: 1799856000000 }] },
  },
});
assert.equal(u7.expiryAt, 1799856000000); // plan EndTime, not sessionExpireTimeStamp
assert.equal(u7.total, null); // TotalCount is a page count, not credits
assert.equal(u7.ok, false);

// --- usage parser: garbage ---
assert.equal(parseUsage('{}').ok, false);
assert.equal(parseUsage('not json').ok, false);

console.log('all tests passed');
