# Passive probe: claim iface 0 and only READ the interrupt IN endpoints. Sends nothing.
import sys, threading, time, usb.core, usb.util

dur = float(sys.argv[1]) if len(sys.argv) > 1 else 15
dev = usb.core.find(idVendor=0x0ADC, idProduct=0x0005)
assert dev, "receiver not found"
print("strings:", dev.manufacturer, "|", dev.product, "|", dev.serial_number)
dev.set_configuration()  # already config 1; no-op on device side besides SET_CONFIGURATION
usb.util.claim_interface(dev, 0)
t0 = time.monotonic()
lock = threading.Lock()

def listen(ep, size):
    n = 0
    while time.monotonic() - t0 < dur:
        try:
            data = bytes(dev.read(ep, size, timeout=500))
        except usb.core.USBTimeoutError:
            continue
        n += 1
        with lock:
            print(f"{time.monotonic()-t0:8.3f} EP{ep:#04x} len={len(data):2d} {data.hex(' ')}", flush=True)
    with lock:
        print(f"EP{ep:#04x}: {n} packets in {dur}s")

ts = [threading.Thread(target=listen, args=a) for a in ((0x81, 16), (0x82, 64))]
[t.start() for t in ts]; [t.join() for t in ts]
usb.util.release_interface(dev, 0)
