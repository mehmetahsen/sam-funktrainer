// A simulated receiver + sensor behind navigator.usb, for working on the page without hardware.
// Loaded by tools/demo.html before the page starts. Implements the protocol in docs/protocol.md:
// link handshake, variable reads, stream start/stop and 100 measurement packets per second with an
// aim point circling near the centre and a shot every 5 seconds.
// Add ?nosensor to the demo URL to simulate a sensor that is switched off.
(() => {
  const sensorOn = !location.search.includes('nosensor');
  const queue = [];
  let waiting = null, timer = null, n = 0;
  const push = bytes => {
    const result = { status: 'ok', data: new DataView(new Uint8Array(bytes).buffer) };
    if (waiting) { waiting(result); waiting = null; } else queue.push(result);
  };
  const be16 = v => [(v >> 8) & 255, v & 255];
  const be32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const vars = {
    6: { 0: 106, 1: 1, 2: 200, 0x65: 1, 0x67: 1, 0x69: 0, 0x952: 2, 0x95e: 4711 },
    8: { 0: 108, 1: 1, 2: 75, 3: -1, 4: 360, 5: 350, 6: 150, 7: 0, 8: 90, 9: 1, 10: 32, 0x0b: -475, 0x0c: -475,
         0x64: -1, 0x65: 1, 0x66: 75, 0x67: 417, 0x68: -1, 0x950: -1, 0x952: 12, 0x95e: 4711 },
  };
  function sample() {
    n++;
    // Wanted aim point in mm; with sensor angle 90 and zoom -475: X = 475 * yraw, Y = -475 * xraw.
    const X = 2 + 3 * Math.cos(n / 40), Y = -1 + 3 * Math.sin(n / 40), yraw = X / 475, xraw = -Y / 475;
    const status = 3 | (n % 500 === 0 ? 0x400 : 0);
    push([0, 10, 0, 0, ...be16(status),
      ...be16(2000 * (1 - yraw)), ...be16(2000 * (1 - xraw)), ...be16(2000 * (1 + yraw)), ...be16(2000 * (1 + xraw)),
      3, 0xe1, 255, 255]);
  }
  const device = {
    vendorId: 0x0adc, productId: 5, manufacturerName: 'KE Knestel Elektronik GmbH (simulated)', productName: 'SAM-Funktrainer',
    serialNumber: '04711', usbVersionMajor: 1, usbVersionMinor: 0, usbVersionSubminor: 0,
    deviceVersionMajor: 1, deviceVersionMinor: 0, deviceVersionSubminor: 6, deviceClass: 0xdc, deviceSubclass: 0, deviceProtocol: 0,
    configuration: { interfaces: [{ alternate: { interfaceClass: 0xdc, interfaceSubclass: 0xa0, interfaceProtocol: 0xb0, endpoints: [
      { endpointNumber: 2, direction: 'in', type: 'interrupt', packetSize: 64 },
      { endpointNumber: 2, direction: 'out', type: 'interrupt', packetSize: 64 }] } }] },
    open: async () => {}, claimInterface: async () => {},
    close: async () => { clearInterval(timer); },
    transferIn: () => new Promise(resolve => { if (queue.length) resolve(queue.shift()); else waiting = resolve; }),
    transferOut: async (endpoint, data) => {
      const d = new DataView(data.buffer), type = d.getUint16(0);
      if (type === 1) { push([0, 1]); push([0, 1]); }                                   // READY, answered twice
      else if ((type === 8 || type === 9) && !sensorOn) push([0, 5, 0, 9, 0, 0, 0, 1]); // NAK 1: sensor not reachable
      else if (type === 6 || type === 8) {
        const nr = d.getUint16(2), v = vars[type][nr];
        push(v === undefined ? [0, 5, 0, type, 0, 0, 0, 3] : [0, type, ...be16(nr), ...be32(v)]);
      } else if (type === 9) {                                                          // only "streaming" is modelled
        clearInterval(timer);
        if (d.getUint32(4)) timer = setInterval(sample, 10);
        push([0, 4, 0, 9]);
      } else if (type === 7) push([0, 4, 0, 7]);
      return { status: 'ok', bytesWritten: data.byteLength };
    },
  };
  Object.defineProperty(navigator, 'usb', { value: { requestDevice: async () => device, addEventListener() {} } });
})();
