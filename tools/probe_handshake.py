# Replays only what usbtrn32.dll OpenUSB/CloseUSB send: "00 01" on open, "00 02" on close (EP 0x02).
# Logs everything arriving on EP 0x82 (and 0x81, unused by the PC software) meanwhile.
import sys, threading, time, usb.core, usb.util

dur = float(sys.argv[1]) if len(sys.argv) > 1 else 10
dev = usb.core.find(idVendor=0x0ADC, idProduct=0x0005)
assert dev, "receiver not found"
dev.set_configuration()
usb.util.claim_interface(dev, 0)
t0 = time.monotonic()
lock = threading.Lock()
stop = False

def listen(ep, size):
    n = 0
    while not stop:
        try:
            data = bytes(dev.read(ep, size, timeout=200))
        except usb.core.USBTimeoutError:
            continue
        n += 1
        with lock:
            print(f"{time.monotonic()-t0:8.3f} IN {ep:#04x} len={len(data):2d} {data.hex(' ')}", flush=True)
    with lock:
        print(f"IN {ep:#04x}: {n} packets")

ts = [threading.Thread(target=listen, args=a) for a in ((0x81, 16), (0x82, 64))]
[t.start() for t in ts]
time.sleep(0.6)  # original waits 600 ms after open on NT
print(f"{time.monotonic()-t0:8.3f} OUT 0x02 00 01", flush=True)
dev.write(0x02, b"\x00\x01", timeout=500)
time.sleep(dur)
print(f"{time.monotonic()-t0:8.3f} OUT 0x02 00 02", flush=True)
dev.write(0x02, b"\x00\x02", timeout=500)
time.sleep(0.5)
stop = True
[t.join() for t in ts]
usb.util.release_interface(dev, 0)
