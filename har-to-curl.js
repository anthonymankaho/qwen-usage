'use strict';
// Usage: node har-to-curl.js <path-to.har>
// Finds every HAR entry carrying a piece of the Token Plan quota picture
// (the console splits it across usage / subscription / quota-config),
// prints replayable cURL commands (one per line), writes them to
// qwen-curl.txt beside the HAR, and shows the merged parse.
const fs = require('fs');
const path = require('path');
const { parseUsage, mergeUsages } = require('./usage-parser');

const harPath = process.argv[2];
if (!harPath) {
  console.error('usage: node har-to-curl.js <path-to.har>');
  process.exit(1);
}
const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
const entries = (har.log && har.log.entries) || [];

function bodyOf(entry) {
  const c = entry.response && entry.response.content;
  if (!c || !c.text) return '';
  return c.encoding === 'base64' ? Buffer.from(c.text, 'base64').toString('utf8') : c.text;
}

function quote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function useful(u) {
  return u.ok || u.spec !== null || u.resetAt !== null || u.daysLeft !== null || (u.monthlyBySpec && Object.keys(u.monthlyBySpec).length > 0);
}

const hits = [];
for (const entry of entries) {
  const text = bodyOf(entry);
  if (!text) continue;
  let usage;
  try {
    usage = parseUsage(text);
  } catch (e) {
    continue;
  }
  if (!useful(usage)) continue;
  hits.push({ entry, text, usage });
}

if (!hits.length) {
  console.log('No HAR entry contained recognizable quota fields.');
  console.log('Request URLs seen in this HAR:');
  for (const e of entries) console.log('  ' + e.request.method + ' ' + e.request.url);
  process.exit(2);
}

function toCurl(entry) {
  const req = entry.request;
  const parts = ['curl ' + quote(req.url)];
  for (const h of req.headers) {
    if (/^(host|content-length|connection|accept-encoding|accept-charset)$/i.test(h.name)) continue;
    if (h.name.startsWith(':')) continue; // http/2 pseudo-headers
    parts.push('-H ' + quote(h.name + ': ' + h.value));
  }
  if (req.postData && req.postData.text) parts.push('--data-raw ' + quote(req.postData.text));
  return parts.join(' ');
}

const merged = mergeUsages(hits.map((h) => h.usage));
const curls = hits.slice(0, 6).map((h) => toCurl(h.entry));

console.log('entries scanned: ' + entries.length + ', quota-bearing: ' + hits.length);
for (const h of hits.slice(0, 6)) {
  const u = h.usage;
  console.log('  ' + h.entry.request.method + ' ' + h.entry.request.url.slice(0, 110));
  console.log('      percent=' + u.percent + ' remaining=' + u.remaining + ' total=' + u.total + ' daysLeft=' + u.daysLeft + ' spec=' + u.spec + ' resetAt=' + u.resetAt + ' expiryAt=' + u.expiryAt);
}
console.log('merged fields:');
for (const m of merged.matched) console.log('  ' + m);
console.log('merged => percent=' + merged.percent + ' remaining=' + merged.remaining + ' total=' + merged.total + ' resetAt=' + merged.resetAt + ' expiryAt=' + merged.expiryAt + ' daysLeft=' + merged.daysLeft + ' spec=' + merged.spec);
const dir = path.dirname(path.resolve(harPath));
fs.writeFileSync(path.join(dir, 'qwen-response.json'), hits.map((h) => h.text).join('\n-----\n'));
const out = path.join(dir, 'qwen-curl.txt');
fs.writeFileSync(out, curls.join('\n') + '\n');
console.log('cURL lines written to: ' + out + ' (' + curls.length + ' lines)');
