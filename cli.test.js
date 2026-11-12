'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createServer } = require('node:http');
const { once } = require('node:events');
const path = require('node:path');
const test = require('node:test');
const { run } = require('./cli');

const cliPath = path.join(__dirname, 'cli.js');

function capture() {
  let output = '';
  return { stream: { write: (text) => { output += text; } }, read: () => output };
}

async function withApi(handler, callback) {
  const server = createServer((request, response) => handler(request, response));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('help prints usage without contacting the API', async () => {
  const stdout = capture();
  const code = await run(['help'], { stdout: stdout.stream });
  assert.equal(code, 0);
  assert.match(stdout.read(), /snip add <url>/);
  assert.match(stdout.read(), /snip open <code>/);
});

test('add validates URLs and prints the created short URL', async () => {
  const stdout = capture();
  await withApi((request, response) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/api/links');
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      assert.equal(JSON.parse(body).url, 'https://example.com/');
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: 'a1B2c3', url: 'https://example.com/', shortUrl: 'http://localhost:3000/a1B2c3', hits: 0, createdAt: new Date().toISOString() }));
    });
  }, async (apiBase) => {
    assert.equal(await run(['add', 'https://example.com'], { env: { SNIP_API: apiBase }, stdout: stdout.stream }), 0);
  });
  assert.equal(stdout.read(), 'http://localhost:3000/a1B2c3\n');
  await assert.rejects(run(['add', 'javascript:alert(1)'], { env: { SNIP_API: 'http://127.0.0.1' } }), /http or https/);
});

test('ls prints an aligned list and an empty-state message', async () => {
  await withApi((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify([{ code: 'a1B2c3', url: 'https://example.com', hits: 12 }]));
  }, async (apiBase) => {
    const stdout = capture();
    await run(['ls'], { env: { SNIP_API: apiBase }, stdout: stdout.stream });
    assert.match(stdout.read(), /CODE\s+HITS\s+URL/);
    assert.match(stdout.read(), /a1B2c3\s+12\s+https:\/\/example\.com/);
  });
  const emptyOut = capture();
  await run(['ls'], {
    env: { SNIP_API: 'http://localhost:3000' },
    stdout: emptyOut.stream,
    fetch: async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
  });
  assert.equal(emptyOut.read(), 'No links yet.\n');
});

test('open reads the redirect manually and launches only its HTTP(S) Location', async () => {
  const stdout = capture();
  let opened;
  await withApi((request, response) => {
    assert.equal(request.url, '/a1B2c3');
    response.writeHead(302, { location: 'https://example.com/destination' });
    response.end();
  }, async (apiBase) => {
    await run(['open', 'a1B2c3'], {
      env: { SNIP_API: apiBase }, stdout: stdout.stream,
      openUrl: async (url) => { opened = url; }
    });
  });
  assert.equal(opened, 'https://example.com/destination');
  assert.match(stdout.read(), /^Opened https:/);

  await assert.rejects(run(['open', 'a1B2c3'], {
    env: { SNIP_API: 'http://localhost:3000' },
    fetch: async () => new Response(null, { status: 302, headers: { location: 'javascript:alert(1)' } }),
    openUrl: async () => assert.fail('unsafe URL must not be opened')
  }), /must use http or https/);
});

test('unknown command and wrong arity are errors', async () => {
  await assert.rejects(run(['wat']), /Unknown command/);
  await assert.rejects(run(['ls', 'extra']), /Usage: snip ls/);
});

test('CLI reports dead-backend failure on stderr and exits 1', () => {
  const result = spawnSync(process.execPath, [cliPath, 'ls'], {
    encoding: 'utf8',
    env: { ...process.env, SNIP_API: 'http://127.0.0.1:1' },
    timeout: 5000
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Error: Cannot reach API/);
  assert.equal(result.stdout, '');
});