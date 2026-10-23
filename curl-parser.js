'use strict';
// Parses a DevTools "Copy as cURL" command into { method, url, headers, body }.
// Pure module, unit-tested by test.js.

function tokenize(input) {
  const tokens = [];
  let cur = '';
  let started = false;
  let quote = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === '\\' && quote === '"') {
        const nxt = input[i + 1];
        if (nxt === '"' || nxt === '\\' || nxt === '$' || nxt === '`') {
          cur += nxt;
          i++;
          continue;
        }
        cur += ch;
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) {
        tokens.push(cur);
        cur = '';
        started = false;
      }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) tokens.push(cur);
  return tokens;
}

const VALUE_FLAGS = new Set(['-H', '--header', '-X', '--request', '-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '-u', '--user', '-A', '--user-agent', '-e', '--referer', '-o', '--output']);

function parseCurl(input) {
  const raw = String(input).replace(/\\\r?\n/g, ' ').trim();
  const tokens = tokenize(raw);
  if (!tokens.length || !/^curl(\.exe)?$/i.test(tokens[0])) {
    throw new Error('not a curl command');
  }
  let url = null;
  let method = null;
  let body = null;
  const headers = {};
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (VALUE_FLAGS.has(t)) {
      const v = tokens[++i];
      if (v === undefined) throw new Error(`flag ${t} is missing its value`);
      if (t === '-H' || t === '--header') {
        const idx = v.indexOf(':');
        if (idx > 0) headers[v.slice(0, idx).trim().toLowerCase()] = v.slice(idx + 1).trim();
      } else if (t === '-X' || t === '--request') {
        method = v.toUpperCase();
      } else if (t.startsWith('-d') || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-urlencode') {
        body = body === null ? v : body + '&' + v;
      }
      // -u / -A / -e / -o: intentionally ignored, cookies ride in -H
      continue;
    }
    if (t.startsWith('--header=')) {
      const v = t.slice('--header='.length);
      const idx = v.indexOf(':');
      if (idx > 0) headers[v.slice(0, idx).trim().toLowerCase()] = v.slice(idx + 1).trim();
      continue;
    }
    if (t.startsWith('-')) continue; // valueless flag such as --compressed, -s, -L
    if (url === null) url = t;
  }
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('no http(s) URL found in curl command');
  return {
    method: method || (body !== null ? 'POST' : 'GET'),
    url,
    headers,
    body,
  };
}

module.exports = { parseCurl };
