'use strict';
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { parseUsage, mergeUsages } = require('./usage-parser');
const { parseCurl } = require('./curl-parser');

let item;
let log;
let timer;
let extPath;
let state; // { usage, at, source, error }

function cfg() {
  return vscode.workspace.getConfiguration('qwenUsage');
}

function fmtNum(n) {
  return Math.round(n).toLocaleString('en-US');
}

function fmtDay(ms) {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtFull(ms) {
  return new Date(ms).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function md(lines) {
  return new vscode.MarkdownString(lines.filter((l) => l !== undefined).join('\n\n'));
}

function isStale() {
  const mins = cfg().get('pollMinutes', 30);
  return !state.at || Date.now() - state.at > mins * 60000;
}

function schedule() {
  if (timer) clearInterval(timer);
  const mins = Math.max(1, cfg().get('pollMinutes', 30));
  timer = setInterval(() => refresh(false), mins * 60000);
}

function render() {
  const u = state.usage;
  if (!u) {
    item.text = '$(cloud) Qwen —';
    item.tooltip = md(['**Qwen Usage**', state.error || 'Not configured yet. Click for setup options.']);
    item.backgroundColor = undefined;
    item.show();
    return;
  }
  const parts = ['$(cloud) Qwen'];
  if (u.percent !== null) parts.push(u.percent.toFixed(1) + '%');
  if (u.remaining !== null) parts.push(fmtNum(u.remaining) + ' left');
  if (u.resetAt) parts.push('resets ' + fmtDay(u.resetAt));
  item.text = parts.join(' ');

  const lines = ['**Qwen Cloud Token Plan**'];
  if (u.spec !== null) lines.push(`Plan: ${u.spec}`);
  if (u.percent !== null) lines.push(`Remaining: ${u.percent.toFixed(1)}%`);
  if (u.remaining !== null) lines.push(`Credits remaining: ${fmtNum(u.remaining)}${u.total !== null ? ' / ' + fmtNum(u.total) : ''}`);
  if (u.daysLeft !== null) lines.push(`Days left: ${u.daysLeft}`);
  if (u.resetAt) lines.push(`Quota resets: ${fmtFull(u.resetAt)}`);
  if (u.expiryAt) lines.push(`Plan expires: ${fmtFull(u.expiryAt)}`);
  lines.push(`Updated: ${fmtFull(state.at)} (${state.source})`);
  if (state.error) lines.push('', `$(warning) ${state.error}`);
  lines.push('', 'Click to refresh now.');
  item.tooltip = md(lines);

  const low = cfg().get('lowPercentThreshold', 15);
  item.backgroundColor = state.error
    ? new vscode.ThemeColor('statusBarItem.errorBackground')
    : u.percent !== null && u.percent < low
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
  item.show();
}

function fail(msg, interactive) {
  state.error = msg;
  log.appendLine('[error] ' + msg);
  render();
  if (interactive) {
    vscode.window.showErrorMessage('Qwen Usage: ' + msg, 'Show Log', 'Open Dashboard').then((pick) => {
      if (pick === 'Show Log') log.show();
      if (pick === 'Open Dashboard') vscode.env.openExternal(vscode.Uri.parse(cfg().get('dashboardUrl')));
    });
  }
}

async function fetchOne(req) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    const headers = Object.assign({}, req.headers);
    const extra = cfg().get('extraHeaders', {}) || {};
    for (const [k, v] of Object.entries(extra)) headers[String(k).toLowerCase()] = String(v);
    for (const h of ['host', 'content-length', 'connection', 'accept-encoding', 'accept-charset']) delete headers[h];
    const res = await fetch(req.url, { method: req.method, headers, body: req.body, signal: ctrl.signal });
    const text = await res.text();
    log.appendLine(`[${new Date().toISOString()}] ${res.status} ${req.method} ${req.url}`);
    log.appendLine(text.slice(0, 2000));
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${req.url.slice(0, 80)}`);
    const usage = parseUsage(text);
    if (!usage.ok && usage.spec === null && usage.resetAt === null && usage.daysLeft === null) {
      throw new Error(`no quota fields in ${req.url.slice(0, 80)}`);
    }
    return usage;
  } finally {
    clearTimeout(to);
  }
}

async function refresh(interactive) {
  let rawText = cfg().get('curl') || '';
  const curlFile = (cfg().get('curlFile') || '').trim();
  if (curlFile) {
    try {
      rawText = fs.readFileSync(curlFile, 'utf8') + '\n' + rawText;
    } catch (e) {
      log.appendLine('[curlFile] cannot read ' + curlFile + ': ' + e.message);
    }
  }
  const curls = rawText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^curl(\.exe)?\s/i.test(s));
  if (!curls.length) {
    if (interactive) await notConfigured();
    else render();
    return;
  }
  const reqs = [];
  for (const c of curls) {
    try {
      reqs.push(parseCurl(c));
    } catch (e) {
      fail('bad cURL line in settings: ' + e.message, interactive);
      return;
    }
  }
  item.text = '$(sync~spin) Qwen …';
  const settled = await Promise.allSettled(reqs.map(fetchOne));
  const usages = [];
  const errs = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') usages.push(s.value);
    else errs.push(s.reason && s.reason.message ? s.reason.message : String(s.reason));
  }
  if (!usages.length) {
    fail((errs.join('; ') || 'all fetches failed') + ' — the session cookie has probably expired; re-export a HAR or re-copy the cURLs.', interactive);
    return;
  }
  if (errs.length) log.appendLine('[partial] ' + errs.join('; '));
  state = { usage: mergeUsages(usages), at: Date.now(), source: `curl replay ×${usages.length}`, error: null };
  render();
}

async function pasteClipboard() {
  const text = await vscode.env.clipboard.readText();
  const usage = parseUsage(text);
  if (!usage.ok) {
    vscode.window.showWarningMessage('Qwen Usage: the clipboard does not contain recognizable usage JSON.');
    return;
  }
  state = { usage, at: Date.now(), source: 'clipboard paste', error: null };
  render();
  vscode.window.setStatusBarMessage('Qwen Usage updated from clipboard.', 4000);
}

async function notConfigured() {
  const pick = await vscode.window.showInformationMessage(
    'Qwen Usage is not configured yet. Paste "Copy as cURL" lines from the Token Plan page (see README), or paste a usage JSON response from the clipboard.',
    'Open README',
    'Paste From Clipboard',
    'Open Dashboard'
  );
  if (pick === 'Open README') vscode.window.showTextDocument(vscode.Uri.file(path.join(extPath, 'README.md')));
  if (pick === 'Paste From Clipboard') await pasteClipboard();
  if (pick === 'Open Dashboard') vscode.env.openExternal(vscode.Uri.parse(cfg().get('dashboardUrl')));
}

function activate(context) {
  extPath = context.extensionPath;
  log = vscode.window.createOutputChannel('Qwen Usage');
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.name = 'Qwen Usage';
  item.command = 'qwenUsage.refresh';
  state = { usage: null, at: null, source: null, error: null };

  context.subscriptions.push(
    item,
    log,
    vscode.commands.registerCommand('qwenUsage.refresh', () => refresh(true)),
    vscode.commands.registerCommand('qwenUsage.openDashboard', () => vscode.env.openExternal(vscode.Uri.parse(cfg().get('dashboardUrl')))),
    vscode.commands.registerCommand('qwenUsage.pasteClipboard', pasteClipboard),
    vscode.commands.registerCommand('qwenUsage.showLog', () => log.show()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('qwenUsage')) {
        schedule();
        refresh(false);
      }
    }),
    vscode.window.onDidChangeWindowState((w) => {
      if (w.focused && isStale() && (cfg().get('curl') || '').trim()) refresh(false);
    })
  );
  render();
  schedule();
  refresh(false);
}

function deactivate() {
  if (timer) clearInterval(timer);
}

module.exports = { activate, deactivate };
