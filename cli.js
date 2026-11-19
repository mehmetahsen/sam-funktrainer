#!/usr/bin/env node
// SAM-Funktrainer command line.
//   node cli.js info                      USB details and every variable of receiver and sensor
//   node cli.js stream [seconds]          CSV to stdout until Ctrl-C (or for N seconds); shots on stderr
// Options: --target lg|lp  --new-formula  --mount-angle <deg>  (stream)   --log  packet log on stderr
import { parseArgs } from 'node:util';
import { webusb } from 'usb';
import { Trainer, Tracker, TARGETS, USB_FILTER, RECEIVER, SENSOR, VARS, ring, hex, hexBytes, formatVar, batteryVolts, describePacket, usbInfo } from './sam.js';

const { values: opt, positionals: [cmd = 'info', seconds] } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: 'string', default: 'lg' },
    'new-formula': { type: 'boolean', default: false },
    'mount-angle': { type: 'string', default: '0' },
    log: { type: 'boolean', default: false },
  },
});
const target = TARGETS[opt.target];
if (!['info', 'stream'].includes(cmd) || !target) {
  console.error(`usage: cli.js info | stream [seconds] [--target ${Object.keys(TARGETS).join('|')}] [--new-formula] [--mount-angle deg] [--log]`);
  process.exit(2);
}

let tracker, t0, shots = 0;
const dev = await webusb.requestDevice({ filters: [USB_FILTER] });
const sam = new Trainer(dev, (s, t) => {
  const p = tracker.feed(s);
  t0 ??= t;
  const xy = p.valid ? `${p.x.toFixed(2)},${p.y.toFixed(2)}` : ',';
  console.log(`${(t - t0).toFixed(0)},${xy},${+p.shot},${s.a},${s.b},${s.c},${s.d},${s.force}`);
  if (p.shot && p.valid) {
    console.error(`shot ${++shots}: ${ring(Math.hypot(p.x, p.y), target).toFixed(1)}  (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) mm`);
  }
}, (dir, d) => {
  if (opt.log && d.getUint16(0) !== 10) console.error(`${dir === 'tx' ? 'TX ' : ' RX'}  ${hexBytes(d).padEnd(23)}  ${describePacket(d, dir)}`);
});

const quit = async code => {
  await sam.close().catch(() => {});
  process.exit(code); // the pending IN transfer would keep Node alive
};
const section = (title, rows) => {
  console.log(`${title}\n${rows.map(([k, v]) => `  ${k.padEnd(36)} ${v}`).join('\n')}`);
};
const varRows = (kind, vars) => Object.entries(vars).map(([nr, v]) => [`${hex(+nr)} ${VARS[kind][nr]}`, v === null ? 'not in firmware' : formatVar(kind, +nr, v)]);

try {
  await sam.open();
  const sensor = await sam.readAll(SENSOR);
  if (cmd === 'info') {
    const receiver = await sam.readAll(RECEIVER);
    section('USB device', usbInfo(dev));
    section('Receiver', varRows(RECEIVER, receiver));
    section('Sensor', sensor ? varRows(SENSOR, sensor) : [['', 'not reachable (switched off, out of range or other radio channel)']]);
  } else {
    if (!sensor) throw new Error('sensor not reachable');
    if (sensor[0x67] < 0) console.error(`warning: sensor battery low (${batteryVolts(sensor[0x67])} V)`);
    tracker = new Tracker({ zoomX: sensor[0x0b], zoomY: sensor[0x0c], angle: sensor[8] + Number(opt['mount-angle']), offX: 0, offY: 0,
      newFormula: opt['new-formula'], scale: target.dist / 10 });
    console.log('t_ms,x_mm,y_mm,shot,a,b,c,d,force');
    process.on('SIGINT', () => quit(0));
    await sam.startStream();
    if (seconds) setTimeout(() => quit(0), seconds * 1000);
    await new Promise(() => {}); // runs until SIGINT or the timer
  }
  await quit(0);
} catch (e) {
  console.error(`error: ${e.message}`);
  await quit(1);
}
