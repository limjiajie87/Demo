#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const DEFAULT_API = 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 10000;

function usage() {
  return [
    'Usage:',
    '  snip add <url>    Create a short link',
    '  snip ls           List links and hit counts',
    '  snip open <code>  Open a short link in the default browser',
    '  snip help         Show this help',
    '',
    'Set SNIP_API to change the API base URL (default: http://localhost:3000).'
  ].join('\n');
}

function getApiBase(env) {
  const value = env.SNIP_API || DEFAULT_API;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid SNIP_API URL: ${value}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('SNIP_API must use http or https.');
  }
  return value.replace(/\/+$/, '');
}

function validateHttpUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('URL must be a valid http or https URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must use http or https.');
  }
  return parsed.href;
}

async function requestJson(path, options, context) {
  let response;
  try {
    response = await context.fetch(`${context.apiBase}${path}`, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    const reason = error && error.name === 'TimeoutError'
      ? `request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      : (error && error.message) || 'network error';
    throw new Error(`Cannot reach API at ${context.apiBase}: ${reason}`);
  }

  if (response.status === 302) return { response, payload: null };

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`API returned invalid JSON (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const detail = payload && typeof payload.error === 'string' ? `: ${payload.error}` : '';
    throw new Error(`API request failed with HTTP ${response.status}${detail}`);
  }
  return { response, payload };
}

function launchUrl(url) {
  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'explorer.exe';
    args = [url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (process.platform === 'linux') {
    command = 'xdg-open';
    args = [url];
  } else {
    throw new Error(`Opening links is not supported on ${process.platform}.`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function formatLinks(links) {
  if (!Array.isArray(links)) throw new Error('API returned an invalid links list.');
  if (links.length === 0) return 'No links yet.';

  const rows = links.map((link) => {
    if (!link || typeof link.code !== 'string' || typeof link.url !== 'string' || !Number.isFinite(link.hits)) {
      throw new Error('API returned a link with invalid fields.');
    }
    return [link.code, String(link.hits), link.url];
  });
  const headers = ['CODE', 'HITS', 'URL'];
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)));
  const line = (row) => `${row[0].padEnd(widths[0])}  ${row[1].padStart(widths[1])}  ${row[2]}`;
  return [line(headers), ...rows.map(line)].join('\n');
}

async function run(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const env = options.env || process.env;
  const fetchImpl = options.fetch || globalThis.fetch;
  const openUrl = options.openUrl || launchUrl;

  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    stdout.write(`${usage()}\n`);
    return 0;
  }

  const context = { apiBase: getApiBase(env), fetch: fetchImpl };
  const [command, argument, extra] = argv;

  if (command === 'add') {
    if (!argument || extra !== undefined) throw new Error('Usage: snip add <url>');
    const url = validateHttpUrl(argument);
    const { payload } = await requestJson('/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url })
    }, context);
    if (!payload || typeof payload.shortUrl !== 'string') throw new Error('API returned an invalid short link.');
    stdout.write(`${payload.shortUrl}\n`);
    return 0;
  }

  if (command === 'ls') {
    if (argument !== undefined) throw new Error('Usage: snip ls');
    const { payload } = await requestJson('/api/links', { method: 'GET' }, context);
    stdout.write(`${formatLinks(payload)}\n`);
    return 0;
  }

  if (command === 'open') {
    if (!argument || extra !== undefined || !/^[A-Za-z0-9]{6}$/.test(argument)) {
      throw new Error('Usage: snip open <6-character-code>');
    }
    const { response } = await requestJson(`/${encodeURIComponent(argument)}`, { redirect: 'manual' }, context);
    if (response.status === 404) throw new Error(`Unknown short code: ${argument}`);
    if (response.status !== 302) throw new Error(`Expected a redirect, received HTTP ${response.status}.`);
    const target = response.headers.get('location');
    if (!target) throw new Error('API redirect did not include a Location header.');
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      throw new Error('API returned an invalid redirect URL.');
    }
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      throw new Error('API redirect must use http or https.');
    }
    await openUrl(targetUrl.href);
    stdout.write(`Opened ${targetUrl.href}\n`);
    return 0;
  }

  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

if (require.main === module) {
  run().catch((error) => {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { formatLinks, launchUrl, run, usage, validateHttpUrl };