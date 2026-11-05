const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { test } = require('node:test');
const { createApp } = require('../dist/server.js');
const { MAX_BODY_BYTES } = require('../dist/body.js');

test('POST /users creates a user and rejects oversized headers before reading a body',
  { timeout: 5000 }, async (t) => {
    const server = createApp();
    t.after(() => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = server.address().port;

    const created = await fetch(`http://127.0.0.1:${port}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Anna', age: 25 }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { name: 'Anna', age: 25 });

    const oversized = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port, path: '/users', method: 'POST', agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': MAX_BODY_BYTES + 1,
        },
      }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('error', reject);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.setTimeout(2000, () => req.destroy(new Error('Response timeout')));
      // Send only headers: the server must reject without waiting for the body.
      req.flushHeaders();
    });
    assert.equal(oversized.status, 413);
    assert.equal(typeof JSON.parse(oversized.body).error, 'string');
  });
