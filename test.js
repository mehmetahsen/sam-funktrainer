// node test.js
import assert from 'node:assert/strict';
import { parseSample, describePacket, formatVar, ring, lowpass, Tracker, TARGETS, SENSOR } from './sam.js';

// Packet captured from the real sensor (docs/live-and-prior-art.md, probe 4).
const view = text => new DataView(new Uint8Array(text.split(' ').map(h => parseInt(h, 16))).buffer);
const s = parseSample(view('00 0a 00 00 08 03 06 99 03 b9 16 67 16 e8 03 e1 ff ff'));
assert.deepEqual(s, { a: 0x699, b: 0x3b9, c: 0x1667, d: 0x16e8, status: 0x803, force: 3, shot: false, batteryLow: true, force2: 0x3e1, pulse: null });

// Packet descriptions for the log, on packets captured from the real device.
assert.equal(describePacket(view('00 05 00 09 00 00 00 01'), 'rx'), 'NAK 1: sensor not reachable');
assert.equal(describePacket(view('00 06 09 5e ff ff ff ff'), 'tx'), 'read receiver 0x095e serial number');
assert.equal(describePacket(view('00 06 09 5e 00 00 12 67'), 'rx'), 'receiver 0x095e serial number = 4711');
assert.equal(describePacket(view('00 09 00 64 00 00 00 01'), 'tx'), 'write sensor 0x0064 streaming enabled = 1');
assert.equal(describePacket(view('00 04 00 09'), 'rx'), 'ACK');
assert.equal(formatVar(SENSOR, 0x67, 0x80000163 | 0), '3.55 V (LOW)');

// Ring values: demo database shot (air pistol, 40.73 mm from centre) is stored as 5.9.
assert.equal(ring(40.73, TARGETS.lp), 5.9);
assert.equal(ring(0, TARGETS.lg), 10.9);
assert.equal(ring(2.5, TARGETS.lg), 10);    // pellet edge just touches the ten
assert.equal(ring(2.51, TARGETS.lg), 9.9);
assert.equal(ring(500, TARGETS.lg), 0);

// Low-pass settles to its input (unity gain at DC).
const f = lowpass();
let y = 0;
for (let i = 0; i < 300; i++) y = f(1000);
assert.ok(Math.abs(y - 1000) < 0.01, `filter settled at ${y}`);

// Tracker: equal quadrants = centre; shot only on the rising edge; weak signal = invalid.
for (const newFormula of [false, true]) {
  const t = new Tracker({ zoomX: -475, zoomY: -475, angle: 90, offX: 0, offY: 0, newFormula });
  const eq = { a: 2000, b: 2000, c: 2000, d: 2000, shot: false };
  let p;
  for (let i = 0; i < 300; i++) p = t.feed(eq);
  assert.ok(p.valid && Math.abs(p.x) < 1e-6 && Math.abs(p.y) < 1e-6);
  assert.equal(t.feed({ ...eq, shot: true }).shot, true);
  assert.equal(t.feed({ ...eq, shot: true }).shot, false);
  assert.equal(t.feed({ ...eq, a: 100 }).valid, false);
}
console.log('ok');
