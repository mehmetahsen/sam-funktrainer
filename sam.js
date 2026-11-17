// SAM-Funktrainer protocol + math. Runs unchanged in the browser (WebUSB) and in Node (the `usb`
// package's WebUSB interface). Protocol details: docs/app-protocol-re.md, docs/live-and-prior-art.md.

export const USB_FILTER = { vendorId: 0x0adc, productId: 0x0005 };
export const RECEIVER = 6, SENSOR = 8; // packet type of a read; write is type + 1
const READY = 1, NOT_READY = 2, DUMMY = 3, ACK = 4, NAK = 5, SAMPLE = 0x0a;
const EP = 2; // endpoint number of both the 64-byte IN (0x82) and OUT (0x02) endpoints
const NAK_TEXT = { 1: 'sensor not reachable', 2: 'sensor is streaming', 3: 'no such variable' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Known firmware variables. 0..12 are EEPROM settings, 0x64.. runtime state, 0x95x identity. */
export const VARS = {
  [RECEIVER]: {
    0x0000: 'firmware version', 0x0001: 'HF channel default', 0x0002: 'HF transmit power (0..255)',
    0x0065: 'HF channel current', 0x0067: 'sensor available flag', 0x0069: 'HF quality (meaning unclear)',
    0x0950: 'revision', 0x0952: 'variable count - 1', 0x095e: 'serial number',
  },
  [SENSOR]: {
    0x0000: 'firmware version', 0x0001: 'HF channel default', 0x0002: 'shot sensitivity default',
    0x0003: 'options', 0x0004: 'battery low threshold', 0x0005: 'battery off threshold',
    0x0006: 'HF transmit power (0..255)', 0x0007: '(unnamed)', 0x0008: 'sensor angle (deg)',
    0x0009: 'ADS1100 gain', 0x000a: 'ADS1100 sample rate', 0x000b: 'zoom X', 0x000c: 'zoom Y',
    0x0064: 'streaming enabled', 0x0065: 'HF channel current', 0x0066: 'shot sensitivity current',
    0x0067: 'battery', 0x0068: 'microphone test',
    0x0950: 'revision', 0x0952: 'variable count - 1', 0x095e: 'serial number',
  },
};

export const hex = (v, digits = 4) => '0x' + (v >>> 0).toString(16).padStart(digits, '0');
export const hexBytes = d => Array.from(new Uint8Array(d.buffer, d.byteOffset, d.byteLength), b => b.toString(16).padStart(2, '0')).join(' ');
export const batteryVolts = v => (v & 0x7fffffff) / 100;

/** Variable value as text with its unit. */
export function formatVar(target, nr, v) {
  if (nr === 0) return (v / 100).toFixed(2);
  if (target === SENSOR && nr === 0x67) return `${batteryVolts(v).toFixed(2)} V${v < 0 ? ' (LOW)' : ''}`;
  if (target === SENSOR && (nr === 4 || nr === 5)) return `${(v / 100).toFixed(2)} V`;
  return String(v);
}

export class NakError extends Error {
  constructor(code) { super(NAK_TEXT[code] ?? `NAK ${code}`); this.code = code; }
}

/** 18-byte measurement packet -> fields. */
export function parseSample(d) {
  const status = d.getUint16(4), pulse = d.getUint16(16);
  return {
    a: d.getUint16(6), b: d.getUint16(8), c: d.getUint16(10), d: d.getUint16(12), // quadrant photodiodes
    status, force: status & 0x3ff, shot: !!(status & 0x400), batteryLow: !!(status & 0x800),
    force2: d.getUint16(14),
    pulse: pulse === 0xffff ? null : pulse & 0x7fff, // heart rate, null = no pulse sensor
  };
}

/** One-line description of any packet. dir: 'tx' (host to receiver) or 'rx'. */
export function describePacket(d, dir) {
  const type = d.getUint16(0), long = d.byteLength >= 8;
  const who = type === 6 || type === 7 ? 'receiver' : 'sensor';
  const variable = () => `${who} ${hex(d.getUint16(2))} ${VARS[type & ~1][d.getUint16(2)] ?? '?'}`;
  switch (type) {
    case READY: return 'READY (link up)';
    case NOT_READY: return 'NOT_READY (link down)';
    case DUMMY: return 'DUMMY';
    case ACK: return 'ACK';
    case NAK: return long ? `NAK ${d.getInt32(4)}: ${NAK_TEXT[d.getInt32(4)] ?? 'unknown reason'}` : 'NAK';
    case 6: case 8: return !long ? '?' : dir === 'tx' ? `read ${variable()}` : `${variable()} = ${d.getInt32(4)}`;
    case 7: case 9: return long ? `write ${variable()} = ${d.getInt32(4)}` : '?';
    case SAMPLE: {
      if (d.byteLength < 18) return 'sample (short)';
      const s = parseSample(d);
      return `sample A=${s.a} B=${s.b} C=${s.c} D=${s.d} force=${s.force}/${s.force2} status=${hex(s.status)}${s.shot ? ' SHOT' : ''}`;
    }
    default: return `unknown type ${hex(type)}`;
  }
}

/** USB descriptor facts of the receiver as [label, value] rows. */
export function usbInfo(dev) {
  const bcd = (a, b, c) => `${a}.${b}${c}`;
  const iface = dev.configuration?.interfaces[0]?.alternate;
  return [
    ['vendor:product', `${hex(dev.vendorId).slice(2)}:${hex(dev.productId).slice(2)}`],
    ['manufacturer', dev.manufacturerName], ['product', dev.productName], ['serial string', dev.serialNumber],
    ['USB version', bcd(dev.usbVersionMajor, dev.usbVersionMinor, dev.usbVersionSubminor)],
    ['device version', bcd(dev.deviceVersionMajor, dev.deviceVersionMinor, dev.deviceVersionSubminor)],
    ['device class', `${hex(dev.deviceClass, 2)} / ${hex(dev.deviceSubclass, 2)} / ${hex(dev.deviceProtocol, 2)}`],
    ['interface class', iface ? `${hex(iface.interfaceClass, 2)} / ${hex(iface.interfaceSubclass, 2)} / ${hex(iface.interfaceProtocol, 2)}` : '?'],
    ...(iface?.endpoints ?? []).map(e => [`endpoint ${e.endpointNumber} ${e.direction}`, `${e.type}, ${e.packetSize} bytes`]),
  ];
}

export class Trainer {
  /**
   * @param {USBDevice} dev
   * @param {(sample: ReturnType<typeof parseSample>, tMs: number) => void} onSample
   * @param {(dir: 'tx'|'rx', packet: DataView, tMs: number) => void} onPacket  every packet, for logging
   */
  constructor(dev, onSample = () => {}, onPacket = () => {}) {
    this.dev = dev;
    this.onSample = onSample;
    this.onPacket = onPacket;
    this.onError = () => {};        // USB failure in the receive loop (unplugged)
    this.queue = Promise.resolve(); // one request at a time
    this.waiter = null;             // resolves with the next matching non-sample packet
  }

  /** Opens the link to the receiver. The sensor may be off; use readAll(SENSOR) to find out. */
  async open() {
    const dev = this.dev;
    await dev.open();
    if (!dev.configuration) await dev.selectConfiguration(1);
    await dev.claimInterface(0);
    this.#readLoop();
    const ready = this.#wait(1000, 'receiver did not answer');
    await this.#send(READY);
    await ready;
    await this.stopStream().catch(e => { // a previous unclean exit may have left the sensor streaming
      if (!(e instanceof NakError && e.code === 1)) throw e;
    });
  }

  async close() {
    try { await this.stopStream(); } catch { /* sensor may be gone */ }
    this.closing = true;
    await this.#send(NOT_READY);
    await this.dev.close().catch(() => {}); // Node refuses to close with the IN transfer pending
  }

  readVar(target, nr) {
    return this.#request(target, nr, 0xffffffff).then(d => d.getInt32(4));
  }

  writeVar(target, nr, value) {
    return this.#request(target + 1, nr, value);
  }

  /** All known variables of one unit as { nr: value }; null where the firmware has no such variable.
   *  Returns null if the sensor is not reachable. The stream must be stopped. */
  async readAll(target) {
    const out = {};
    for (const key of Object.keys(VARS[target])) {
      try { out[key] = await this.readVar(target, Number(key)); } catch (e) {
        if (!(e instanceof NakError)) throw e;
        if (e.code === 1) return null;
        out[key] = null;
      }
    }
    return out;
  }

  startStream() { return this.writeVar(SENSOR, 0x64, 1); }

  /** The sensor refuses commands for a few seconds while it streams; retry like the original (500 ms). */
  async stopStream() {
    for (let i = 0; ; i++) {
      try { return await this.writeVar(SENSOR, 0x64, 0); } catch (e) {
        if (!(e instanceof NakError && e.code === 2) || i >= 20) throw e;
        await sleep(500);
      }
    }
  }

  #send(type, nr, value) {
    const d = new DataView(new ArrayBuffer(nr === undefined ? 2 : 8));
    d.setUint16(0, type);
    if (nr !== undefined) { d.setUint16(2, nr); d.setUint32(4, value >>> 0); }
    this.onPacket('tx', d, performance.now());
    return this.dev.transferOut(EP, new Uint8Array(d.buffer)); // Node's usb package mishandles a DataView
  }

  /** Next packet accepted by `match`; others (stale replies of an earlier session) are dropped. */
  #wait(ms, what, match = () => true) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiter = null; reject(new Error(what)); }, ms);
      this.waiter = d => { if (match(d)) { clearTimeout(timer); this.waiter = null; resolve(d); } };
    });
  }

  #request(type, nr, value) {
    const isWrite = type === RECEIVER + 1 || type === SENSOR + 1;
    const run = async () => {
      const reply = this.#wait(5000, `timeout: no reply (packet type ${type}, variable ${hex(nr)})`, d => {
        const t = d.getUint16(0);
        if (isWrite) return t === ACK || (t === NAK && d.byteLength >= 8);
        return d.byteLength >= 8 && (t === NAK || (t === type && d.getUint16(2) === nr));
      });
      await this.#send(type, nr, value);
      const d = await reply;
      if (d.getUint16(0) === NAK) throw new NakError(d.getInt32(4));
      return d;
    };
    return this.queue = this.queue.then(run, run);
  }

  async #readLoop() {
    while (!this.closing) {
      let d;
      try { d = (await this.dev.transferIn(EP, 64)).data; } catch (e) { // closed or unplugged
        if (!this.closing) this.onError(e);
        break;
      }
      if (!d || d.byteLength < 2) continue;
      const now = performance.now(), type = d.getUint16(0);
      this.onPacket('rx', d, now);
      if (type === SAMPLE && d.byteLength >= 18) this.onSample(parseSample(d), now);
      else if (type === READY) { if (!this.linkUp) { this.linkUp = true; this.waiter?.(d); } } // sent twice
      else if (type !== NOT_READY && type !== DUMMY) this.waiter?.(d); // ACK, NAK, variable replies
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Math, reconstructed from the original software. Not yet checked against it shot for shot.

/** Second-order Bessel low-pass, as the original applies to each photodiode channel (4 Hz at 100 Hz). */
export function lowpass(fg = 4, fs = 100) {
  const a1 = 1.3617, b1 = 0.618, W = 1 / Math.tan(Math.PI * fg / fs);
  const D = 1 + a1 * W + b1 * W * W;
  const c1 = 2 * (1 - b1 * W * W) / D, c2 = (1 - a1 * W + b1 * W * W) / D;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => {
    const y = (x + 2 * x1 + x2) / D - c1 * y1 - c2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// Dimensions in mm (ISSF 10 m targets, as in the original's WAFFE.DBF).
export const TARGETS = {
  lg: { name: 'Air rifle 10 m', rings: 10, d10: 0.5, ringWidth: 2.5, black: 30.5, pellet: 4.5 },
  lp: { name: 'Air pistol 10 m', rings: 10, d10: 11.5, ringWidth: 8, black: 59.5, pellet: 4.5 },
};

/** Decimal ring value for a hit r mm from the centre (pellet edge scoring). */
export function ring(r, t) {
  const r10 = (t.d10 + t.pellet) / 2;
  const v = r <= r10 ? t.rings + 1 - r / r10 : t.rings - (r - r10) / t.ringWidth;
  return v < 1 ? 0 : Math.min(Math.floor(v * 10 + 1e-9) / 10, t.rings + 0.9);
}

/**
 * Samples -> aim point in mm on the target face (x < 0 left, y < 0 up) and shot events.
 * cfg: { zoomX, zoomY, angle (deg, sensor value + mounting angle), offX, offY (mm), newFormula }
 */
export class Tracker {
  constructor(cfg) {
    this.cfg = cfg;
    this.filters = [0, 1, 2, 3].map(() => lowpass());
    this.wasShot = false;
  }

  feed(s) {
    const raw = [s.a, s.b, s.c, s.d];
    const [a, b, c, d] = raw.map((v, i) => this.filters[i](v));
    const out = {
      valid: raw.every(v => v > 300),      // sensor sees the target's infrared LEDs
      overdriven: raw.some(v => v > 5000), // too close, or target switch on "far"
      shot: s.shot && !this.wasShot,       // rising edge
      x: 0, y: 0,
    };
    this.wasShot = s.shot;
    if (!out.valid) return out;
    const { cfg } = this, sum = a + b + c + d;
    const x = cfg.newFormula ? (c + d - a - b) / sum : (d - b) / (d + b);
    const y = cfg.newFormula ? (b + c - a - d) / sum : (c - a) / (c + a);
    const phi = cfg.angle * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
    out.x = cfg.zoomX * (x * cos - y * sin) - cfg.offX;
    out.y = cfg.zoomY * (x * sin + y * cos) - cfg.offY;
    return out;
  }
}
