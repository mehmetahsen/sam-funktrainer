# Live check of the statically recovered protocol. Reads variables only; the single write is
# sensor var 0x64 (streaming on, then off), which is volatile and is what the original does in training.
# usage: probe_vars.py [stream_seconds]   (0 = no streaming)
import struct, sys, time, usb.core, usb.util

stream_s = float(sys.argv[1]) if len(sys.argv) > 1 else 0
NAK = {1: "no sensor", 2: "sensor streaming", 3: "no such variable"}
dev = usb.core.find(idVendor=0x0ADC, idProduct=0x0005)
assert dev, "receiver not found"
dev.set_configuration()
usb.util.claim_interface(dev, 0)

def rx(timeout_ms):
    try:
        return bytes(dev.read(0x82, 64, timeout=timeout_ms))
    except usb.core.USBTimeoutError:
        return None

def request(kind, var, value=0xFFFFFFFF, timeout=5.0):
    dev.write(0x02, struct.pack(">HHI", kind, var, value), timeout=500)
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        p = rx(200)
        if p is None or p[:2] in (b"\x00\x01", b"\x00\x03", b"\x00\x0a"):
            continue
        return p
    return None

def show(label, kind, var, value=0xFFFFFFFF):
    p = request(kind, var, value)
    if p is None:
        txt = "TIMEOUT"
    elif p[:2] == b"\x00\x05" and len(p) >= 8:
        code = struct.unpack(">I", p[4:8])[0]
        txt = f"NAK {code} ({NAK.get(code, '?')})"
    elif len(p) >= 8:
        v = struct.unpack(">i", p[4:8])[0]
        txt = f"{v} (0x{v & 0xFFFFFFFF:08x})"
    else:
        txt = ""
    print(f"{label:28s} kind={kind:#06x} var={var:#06x} -> {txt:30s} raw[{len(p or b'')}]={(p or b'').hex(' ')}", flush=True)
    return p

try:
    time.sleep(0.6)
    dev.write(0x02, b"\x00\x01", timeout=500)
    print("READY reply:", (rx(1000) or b"").hex(" "))
    print("--- receiver (read kind 0x0006)")
    for name, var in [("version", 0x0000), ("revision", 0x0950), ("nof_vars-1", 0x0952), ("serial", 0x095E),
                      ("hf_channel_default", 0x0001), ("hf_tx_power", 0x0002), ("hf_channel_current", 0x0065),
                      ("sensor_available", 0x0067), ("fw 0x69", 0x0069)]:
        show(name, 0x0006, var)
    print("--- sensor (read kind 0x0008)")
    alive = False
    for name, var in [("version", 0x0000), ("revision", 0x0950), ("nof_vars-1", 0x0952), ("serial", 0x095E),
                      ("hf_channel_current", 0x0065), ("mic_sens_current", 0x0066), ("battery 10mV", 0x0067),
                      ("angle deg", 0x0008), ("zoom_x", 0x000B), ("zoom_y", 0x000C)]:
        p = show(name, 0x0008, var)
        if p and p[:2] == b"\x00\x08":
            alive = True
        elif not alive:
            break  # sensor absent: do not wait 5 s per variable
    if stream_s and alive:
        print(f"--- streaming {stream_s}s (sensor write 0x64 = 1)")
        show("stream on", 0x0009, 0x0064, 1)
        t0, n, lens = time.monotonic(), 0, set()
        while time.monotonic() - t0 < stream_s:
            p = rx(200)
            if p is None:
                continue
            n += 1
            lens.add(len(p))
            if n <= 12 or n % 100 == 0:
                print(f"{time.monotonic()-t0:7.3f} [{len(p)}] {p.hex(' ')}", flush=True)
        dt = time.monotonic() - t0
        print(f"{n} packets in {dt:.2f}s = {n/dt:.1f} Hz, lengths {sorted(lens)}")
        for _ in range(10):  # NAK 2 = sensor still streaming: retry like the original (500 ms)
            p = show("stream off", 0x0009, 0x0064, 0)
            if p and p[:2] == b"\x00\x04":
                break
            time.sleep(0.5)
finally:
    dev.write(0x02, b"\x00\x02", timeout=500)
    usb.util.release_interface(dev, 0)
