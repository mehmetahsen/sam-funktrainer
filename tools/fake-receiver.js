// A simulated receiver + sensor behind navigator.usb, for working on the page without hardware.
// Loaded by tools/demo.html before the page starts. Implements the protocol in docs/protocol.md:
// link handshake, variable reads and writes, NAK 1 (sensor off or on another channel), NAK 2 (sensor
// streaming), NAK 3, stream start/stop and 100 measurement packets per second.
// Add ?nosensor to the demo URL to simulate a sensor that is switched off.
//
// window.fakeSam lets a test steer the simulation:
//   vars        the device variables ({ 6: receiver, 8: sensor }); writes from the page land here
//   aim         null: the aim circles near the centre with a shot every 5 s; { X, Y }: steady aim at
//               that point (mm at 10 m)
//   physics     { angle, zoomX, zoomY }: how the simulated sensor really sees the target. The page only
//               shows true positions if its calibration matches these.
//   shoot()     reports a shot in the next packet
(() => {
  const sensorOn = !location.search.includes('nosensor');
  const queue = [];
  let waiting = null, timer = null, n = 0, shotPending = false, streaming = false;
  const push = bytes => {
    const result = { status: 'ok', data: new DataView(new Uint8Array(bytes).buffer) };
    if (waiting) { waiting(result); waiting = null; } else queue.push(result);
  };
  const be16 = v => [(v >> 8) & 255, v & 255];
  const be32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const fake = window.fakeSam = {
    vars: {
      6: { 0: 106, 1: 1, 2: 200, 0x65: 1, 0x67: 1, 0x69: 0, 0x952: 2, 0x95e: 4711 },
      8: { 0: 108, 1: 1, 2: 75, 3: -1, 4: 360, 5: 350, 6: 150, 7: 0, 8: 90, 9: 1, 10: 32, 0x0b: -475, 0x0c: -475,
           0x64: -1, 0x65: 1, 0x66: 75, 0x67: 417, 0x68: -1, 0x950: -1, 0x952: 12, 0x95e: 4711 },
    },
    aim: null,
    physics: { angle: 90, zoomX: -475, zoomY: -475 },
    shoot() { shotPending = true; },
  };
  const reachable = () => sensorOn && fake.vars[8][0x65] === fake.vars[6][0x65];

  function sample() {
    n++;
    const X = fake.aim ? fake.aim.X : 2 + 3 * Math.cos(n / 40), Y = fake.aim ? fake.aim.Y : -1 + 3 * Math.sin(n / 40);
    // Invert X = zoomX·(x cos φ − y sin φ), Y = zoomY·(x sin φ + y cos φ) to get the raw position x, y.
    const { angle, zoomX, zoomY } = fake.physics, rad = angle * Math.PI / 180, u = X / zoomX, v = Y / zoomY;
    const x = u * Math.cos(rad) + v * Math.sin(rad), y = -u * Math.sin(rad) + v * Math.cos(rad);
    const shot = shotPending || (!fake.aim && n % 500 === 0);
    shotPending = false;
    // Quadrants chosen so that the original's "old" formula gives x = (D−B)/(D+B), y = (C−A)/(C+A).
    push([0, 10, 0, 0, ...be16(3 | (shot ? 0x400 : 0)),
      ...be16(2000 * (1 - y)), ...be16(2000 * (1 - x)), ...be16(2000 * (1 + y)), ...be16(2000 * (1 + x)),
      3, 0xe1, 255, 255]);
  }
  function setStreaming(on) {
    clearInterval(timer);
    streaming = on;
    if (on) timer = setInterval(sample, 10);
  }

  const device = {
    vendorId: 0x0adc, productId: 5, manufacturerName: 'KE Knestel Elektronik GmbH (simulated)', productName: 'SAM-Funktrainer',
    serialNumber: '04711', usbVersionMajor: 1, usbVersionMinor: 0, usbVersionSubminor: 0,
    deviceVersionMajor: 1, deviceVersionMinor: 0, deviceVersionSubminor: 6, deviceClass: 0xdc, deviceSubclass: 0, deviceProtocol: 0,
    configuration: { interfaces: [{ alternate: { interfaceClass: 0xdc, interfaceSubclass: 0xa0, interfaceProtocol: 0xb0, endpoints: [
      { endpointNumber: 2, direction: 'in', type: 'interrupt', packetSize: 64 },
      { endpointNumber: 2, direction: 'out', type: 'interrupt', packetSize: 64 }] } }] },
    open: async () => {}, claimInterface: async () => {},
    close: async () => setStreaming(false),
    transferIn: () => new Promise(resolve => { if (queue.length) resolve(queue.shift()); else waiting = resolve; }),
    transferOut: async (endpoint, data) => {
      const d = new DataView(data.buffer), type = d.getUint16(0);
      if (type === 1) { push([0, 1]); push([0, 1]); }                     // READY, answered twice
      else if (type >= 6 && type <= 9) {
        const unit = type & ~1, write = type & 1, nr = d.getUint16(2), value = d.getInt32(4), vars = fake.vars[unit];
        const nak = code => push([0, 5, 0, unit === 8 ? 9 : type, 0, 0, 0, code]);
        if (unit === 8 && !reachable()) nak(1);
        else if (unit === 8 && streaming && nr !== 0x64) nak(2);
        else if (vars[nr] === undefined) nak(3);
        else if (!write) push([0, type, ...be16(nr), ...be32(vars[nr])]);
        else {
          if (unit === 8 && nr === 0x64) setStreaming(value !== 0); else vars[nr] = value;
          push([0, 4, 0, type]);                                            // ACK, then a channel change takes effect
        }
      }
      return { status: 'ok', bytesWritten: data.byteLength };
    },
  };
  Object.defineProperty(navigator, 'usb', { value: { requestDevice: async () => device, addEventListener() {} } });
})();
