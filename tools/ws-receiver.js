#!/usr/bin/env node
// Example receiver for the page's "Live output": a WebSocket server that prints what arrives.
//   node tools/ws-receiver.js [port]        (default 8765; needs `npm install`)
// Then enter this machine's address and the port in the page, e.g. localhost:8765, and tick "Stream".
// Message format: docs/streaming.md. Positions are summarised once per second; everything else is printed.
import { WebSocketServer } from 'ws';

const port = Number(process.argv[2] ?? 8765);
const server = new WebSocketServer({ port });
console.log(`waiting for the page on ws://<this machine>:${port}`);

server.on('connection', (socket, request) => {
  console.log(`page connected from ${request.socket.remoteAddress}`);
  let samples = 0, last = null;
  const timer = setInterval(() => {
    if (samples) console.log(`${samples} positions/s, latest ${last.valid ? `x ${last.x} y ${last.y} mm` : 'no target in view'}`);
    samples = 0;
  }, 1000);
  socket.on('message', data => {
    const message = JSON.parse(data);
    if (message.type === 'sample') { samples++; last = message; } else console.log(JSON.stringify(message));
  });
  socket.on('close', () => { clearInterval(timer); console.log('page disconnected'); });
});
