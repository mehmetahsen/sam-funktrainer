# What is confirmed, what is not, and how to help

## Confirmed on real hardware

One set was available: receiver firmware 1.06, sensor firmware 1.08, on Linux.

| Item | State |
|---|---|
| USB interface, endpoints, no vendor requests needed | confirmed |
| Link handshake `00 01` / `00 02` | confirmed |
| Reading every listed receiver and sensor variable | confirmed |
| NAK reasons 1, 2 and 3 | confirmed |
| Stream start and stop, including the retry on NAK 2 | confirmed |
| Measurement packet length and field positions | confirmed (quadrants, battery-low bit, "no pulse sensor") |
| Command-line tool (`cli.js`) on Linux with Node | confirmed |
| Web page logic | confirmed only against the simulated receiver in `tools/` |

## Not yet confirmed

| Item | What is missing |
|---|---|
| Web page with a real receiver in a browser | nobody has reported a run yet (Linux, Windows, macOS, Android) |
| Shot bit (status bit 10) | no shot was fired while recording |
| Position math: direction, scale, which of the two formulas | needs someone aiming at a target and comparing with real hits or the original software |
| Ring values against the original software | needs the same shots scored by both |
| Any write other than stream on/off (channel, sensitivity, angle, zoom, transmit power) | never sent; they change stored settings |
| Trigger-force channels | no force sensor available |
| Pulse word | no pulse sensor available |
| Windows with WinUSB, macOS, Android | untested |
| SAMulator (`0adc:0006`) | no device available; protocol expected to match |

## Open questions

1. Why do only about 80 packets per second arrive when the sensor sees the target, but 100 when it does not?
2. What are bytes 2–3 of the measurement packet (always zero so far) and status bits 12–15?
3. What do bytes 2–3 of ACK and NAK packets mean (`00 06`, `00 09` seen)?
4. What is receiver variable 0x67 ("sensor available")? It read 1 with the sensor switched off.
5. What does receiver variable 0x69 do?
6. Which position formula does the original software use by default?
7. What is the reference direction for the sensor's rotation angle? Owners of the original software had to
   find a working angle by trial.
8. Does the sensor really support only radio channels 1–4 while the receiver allows 1–10?
9. What travels on the unused 16-byte endpoints, if anything (firmware update)?
10. How does the receiver behave when a write to a stored variable is out of range?

## How to help

- **Own a set?** Run `node cli.js info --log` and the web page, and report firmware versions and anything
  that differs from [protocol.md](protocol.md). Reports from other firmware versions are especially useful.
- **Have a working installation of the original software** (old Windows PC or virtual machine)? A USB
  capture (Wireshark with USBPcap, or `usbmon` on a Linux host with the receiver passed through to a VM) of
  changing the channel, the sensitivity and running a calibration would settle most of the write sequences.
  Shooting the same series into both programs would settle the math.
- **Have a force or pulse sensor?** Record a stream with `node cli.js stream` and describe what you did.
- **No hardware?** `tools/demo.html` runs the page against a simulated receiver.

When reporting, include the packet log (the page's "Copy" button or `--log`).
