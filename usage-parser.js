'use strict';
// Extracts quota figures from Qwen Cloud usage JSON responses of unknown shape.
// The console's internal API is undocumented and splits the picture across
// several endpoints (usage / subscription / quota-config), so we classify leaf
// keys by name per response and merge across responses with mergeUsages().
// Pure module, unit-tested by test.js.

const RE = {
  days: /(remaining|left|remain)[^a-z0-9]*day|day[^a-z0-9]*(remaining|left|remain)/i,
  percent: /(remaining|remain|left|surplus|balance)[^a-z0-9]*(percent|pct|ratio|rate|percentage)/i,
  usedPercent: /(used|consumed|usage|burned|per1month)[^a-z0-9]*(percent|pct|ratio|rate|percentage)/i,
  reset: /(reset|flush|refresh|renew)[^a-z0-9]*(time|date|at|cycle)|next[^a-z0-9]*cycle|cycle[^a-z0-9]*end[^a-z0-9]*time/i,
  expiry: /expir|expiration|valid[^a-z0-9]*until|end[^a-z0-9]*(time|date)/i,
  remaining: /(remaining|remain|left|surplus|balance|credit_value)/i,
  total: /(total|plan|monthly|cycle|initial)[^a-z0-9]*(quota|credit|token|limit|amount|value)|(quota|credit|token)[^a-z0-9]*(total|limit|cap|max)|cycle[^a-z0-9]*total[^a-z0-9]*(value|days)/i,
  totalDays: /cycle[^a-z0-9]*total[^a-z0-9]*days/i,
  spec: /spec[^a-z0-9]*code/i,
};

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function toMs(v) {
  const n = toNumber(v);
  if (n !== null) return n >= 1e11 ? n : n * 1000; // epoch ms vs epoch s
  if (typeof v === 'string') {
    const ms = Date.parse(v.trim());
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function finalize(found, matched) {
  let { percent, usedPercent, remaining, total, resetAt, expiryAt, daysLeft, spec, monthlyBySpec } = found;
  if (total === null && spec !== null && monthlyBySpec && monthlyBySpec[spec] != null) total = monthlyBySpec[spec];
  if (percent === null && usedPercent !== null) percent = 100 - usedPercent;
  if (percent === null && remaining !== null && total !== null && total > 0) percent = (remaining / total) * 100;
  if (remaining === null && percent !== null && total !== null) remaining = (total * percent) / 100;
  if (daysLeft === null && expiryAt !== null) daysLeft = Math.max(0, Math.ceil((expiryAt - Date.now()) / 86400000));
  const ok = percent !== null || remaining !== null;
  return { ok, percent, remaining, total, resetAt, expiryAt, daysLeft, spec, monthlyBySpec: monthlyBySpec || null, matched };
}

function parseUsage(input) {
  let obj = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input);
    } catch (e) {
      return finalize({ percent: null, usedPercent: null, remaining: null, total: null, resetAt: null, expiryAt: null, daysLeft: null, spec: null, monthlyBySpec: null }, []);
    }
  }
  const found = { percent: null, usedPercent: null, remaining: null, total: null, resetAt: null, expiryAt: null, daysLeft: null, spec: null, monthlyBySpec: null };
  const matched = [];

  (function walk(node, path) {
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const p = path ? path + '.' + key : key;
      if (value !== null && typeof value === 'object') {
        walk(value, p);
        continue;
      }
      const take = (field, val) => {
        if (found[field] === null && val !== null) {
          found[field] = val;
          matched.push(p + '=' + val);
        }
      };
      if (key === 'monthly' && toNumber(value) !== null) {
        // tier catalogue entry, e.g. essential.monthly = plan quota for that tier
        const parent = p.split('.').slice(-2, -1)[0] || '';
        found.monthlyBySpec = found.monthlyBySpec || {};
        if (found.monthlyBySpec[parent] == null) found.monthlyBySpec[parent] = toNumber(value);
        matched.push(p + '=' + value);
      } else if (RE.totalDays.test(key)) {
        // cycle length in days, not a credit total - ignore
      } else if (RE.days.test(key)) {
        take('daysLeft', toNumber(value));
      } else if (RE.percent.test(key)) {
        let n = toNumber(value);
        if (n !== null && n >= 0 && n <= 1) n *= 100; // ratio form
        if (n !== null && n > 100) n = null;
        take('percent', n);
      } else if (RE.usedPercent.test(key)) {
        let n = toNumber(value);
        if (n !== null && n >= 0 && n <= 1) n *= 100;
        if (n !== null && n <= 100) take('usedPercent', n);
      } else if (RE.reset.test(key)) {
        take('resetAt', toMs(value));
      } else if (RE.expiry.test(key) && !/session/i.test(key)) {
        // sessionExpireTimeStamp is the cookie's death, not the plan's
        take('expiryAt', toMs(value));
      } else if (RE.spec.test(key) && typeof value === 'string') {
        take('spec', value);
      } else if (RE.remaining.test(key)) {
        take('remaining', toNumber(value));
      } else if (RE.total.test(key)) {
        take('total', toNumber(value));
      }
    }
  })(obj, '');

  return finalize(found, matched);
}

// The console composes the badge from several endpoints; do the same.
function mergeUsages(list) {
  const found = { percent: null, usedPercent: null, remaining: null, total: null, resetAt: null, expiryAt: null, daysLeft: null, spec: null, monthlyBySpec: null };
  const matched = [];
  for (const u of list) {
    for (const k of ['percent', 'remaining', 'total', 'resetAt', 'expiryAt', 'daysLeft', 'spec']) {
      if (found[k] === null && u[k] != null) found[k] = u[k];
    }
    if (u.monthlyBySpec) found.monthlyBySpec = Object.assign(found.monthlyBySpec || {}, u.monthlyBySpec);
    for (const m of u.matched || []) matched.push(m);
  }
  return finalize(found, matched);
}

module.exports = { parseUsage, mergeUsages };
