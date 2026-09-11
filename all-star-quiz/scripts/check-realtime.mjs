import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';

// Feasibility probe only: loopback, no game data, no public endpoint.
const http = createServer();
const server = new Server(http, {
  transports: ['websocket'],
  allowRequest: (request, callback) => callback(null, request.headers.origin === 'http://localhost:3000'),
});
server.on('connection', socket => socket.on('probe', ack => ack('ok')));
http.listen(0, '127.0.0.1');
await once(http, 'listening');
const url = `http://127.0.0.1:${http.address().port}`;
const options = { transports: ['websocket'], extraHeaders: { Origin: 'http://localhost:3000' }, reconnection: false, timeout: 2000 };
const clients = [connect(url, options), connect(url, options)];
try {
  await Promise.all(clients.map(client => once(client, 'connect')));
  for (const client of clients) assert.equal(await client.timeout(2000).emitWithAck('probe'), 'ok');
  clients[0].disconnect();
  clients[0].connect();
  await once(clients[0], 'connect');
  assert.equal(await clients[0].timeout(2000).emitWithAck('probe'), 'ok');
  const rejected = connect(url, { ...options, extraHeaders: { Origin: 'https://untrusted.example' } });
  try { await once(rejected, 'connect_error'); assert.equal(rejected.connected, false); }
  finally { rejected.close(); }
  console.log('Transport probe passed: two clients, acknowledgements, reconnect, denied origin.');
} finally {
  for (const client of clients) client.close();
  await new Promise(resolve => server.close(resolve));
}
