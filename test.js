// node test.js
import assert from 'node:assert/strict';
import { parseSample, describePacket, formatVar, ring, ringRadius, fitCalibration, allowed, lowpass, Tracker, TARGETS, SENSOR } from './sam.js';

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
// Centre-scored target: the hole centre on the ten's edge is exactly 10.0. Rapid fire: outside ring 5 is 0.
assert.equal(ring(25, TARGETS.gkp), 10);
assert.equal(ring(ringRadius(5, TARGETS.sf) + 2.8, TARGETS.sf), 5);
assert.equal(ring(ringRadius(5, TARGETS.sf) + 3, TARGETS.sf), 0);
assert.equal(ringRadius(1, TARGETS.lp) * 2, 155.5); // the original's total diameter

// Editor limits.
assert.equal(allowed(SENSOR, 10, 32), true);
assert.equal(allowed(SENSOR, 10, 33), false);
assert.equal(allowed(SENSOR, 1, 5), false);
assert.equal(allowed(SENSOR, 0, 108), false); // firmware version is not editable

// Calibration: raw positions made from a known rotation, zoom and offset must give them back.
{
  const truth = { angle: 123, zoomX: -480, zoomY: -470, offX: 1.5, offY: -2 }, rad = truth.angle * Math.PI / 180;
  const marks = [[0, 0], [0, -50], [0, 50], [-50, 0], [50, 0]];
  const points = marks.map(([X, Y]) => {
    const u = (X + truth.offX) / truth.zoomX, v = (Y + truth.offY) / truth.zoomY; // = R(angle) · raw
    return { X, Y, rx: u * Math.cos(rad) + v * Math.sin(rad), ry: -u * Math.sin(rad) + v * Math.cos(rad) };
  });
  const fit = fitCalibration(points);
  assert.deepEqual([fit.angle, fit.zoomX, fit.zoomY], [123, -480, -470]);
  assert.ok(Math.abs(fit.offX - 1.5) < 1e-6 && Math.abs(fit.offY + 2) < 1e-6);
  assert.ok(Math.max(...fit.errors) < 1e-6);
  // The fitted values make the Tracker put the right mark under the aim.
  const t = new Tracker({ zoomX: fit.zoomX, zoomY: fit.zoomY, angle: fit.angle, offX: fit.offX, offY: fit.offY, newFormula: false });
  const { rx, ry } = points[4]; // right mark: old formula x = (D-B)/(D+B), y = (C-A)/(C+A)
  let p;
  for (let i = 0; i < 300; i++) p = t.feed({ a: 2000 * (1 - ry), b: 2000 * (1 - rx), c: 2000 * (1 + ry), d: 2000 * (1 + rx), shot: false });
  assert.ok(Math.abs(p.x - 50) < 0.01 && Math.abs(p.y) < 0.01, `right mark read as ${p.x}, ${p.y}`);
  assert.throws(() => fitCalibration([points[0], points[0], points[0]]));
}

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
