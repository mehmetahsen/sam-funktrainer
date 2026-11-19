# SAM-Funktrainer: open documentation and software

The DISAG / KE Knestel **SAM-Funktrainer** is a wireless aim-analysis trainer for rifle and pistol shooters
(USB receiver `0adc:0005`). Its Windows software is no longer supported; owners report being told by the
vendor's support that it does not work on Windows 10.

**Use it now: [mehmetahsen.de/sam-funktrainer](https://mehmetahsen.de/sam-funktrainer/)**. Open it in Chrome or
Edge, plug in the receiver and click **Connect**. The page explains the one-time setup (a driver on Windows).

This repository contains:

- a **description of the system and its USB protocol**, worked out from the original software and confirmed
  on real hardware, so that anyone can write software for it;
- a **web page** that runs the trainer in a Chromium-based browser through WebUSB, with nothing to install;
- a small **command-line tool** using the same code;
- **tools** for further investigation.

This is an independent project. It is not affiliated with or endorsed by DISAG or KE Knestel Elektronik. It
contains none of their software. The information was obtained for the purpose of making hardware that
people own usable again.

## Status

Early, and only one set has been tested.

- **Confirmed on hardware:** the USB protocol, reading every device variable, starting and stopping the
  measurement stream, the layout of measurement packets.
- **Not yet confirmed:** the position and scoring math (reconstructed from the original software, never
  compared with it), shot detection in practice, the web page on a real receiver, and every platform other
  than Linux.

Details: [docs/status.md](docs/status.md).

## Documentation

| Document | Contents |
|---|---|
| [docs/system.md](docs/system.md) | What the system consists of and how a measurement happens |
| [docs/protocol.md](docs/protocol.md) | USB interface, packets, variables, streaming, example logs |
| [docs/math.md](docs/math.md) | From photodiode values to a scored shot; calibration procedures |
| [docs/original-software.md](docs/original-software.md) | Structure of the original software, its script and data file formats |
| [docs/status.md](docs/status.md) | What is confirmed, open questions, how to help |
| [docs/streaming.md](docs/streaming.md) | Live output to other software over WebSocket: how to use it, message format |

## Web page

Needs Chrome, Edge or another Chromium-based browser. Firefox and Safari have no WebUSB.

Open **https://mehmetahsen.de/sam-funktrainer/**, click **Connect** and pick the SAM-Funktrainer. "How to use"
on the page covers the one-time setup per operating system.

For offline use, download `sam-funktrainer.html` from this repository and open it from disk. The file is
self-contained; no web server is needed.

- Live aim trace, shot detection and decimal ring values on the ten target types of the original software
  (air rifle, air pistol, small bore, Zimmerstutzen, running target, 25 m pistol and large-bore targets) or on
  your own target definitions.
- Sessions are saved automatically in the browser with the aim trace and trigger force of every shot (3 s
  before to 1 s after). They can be reopened, deleted, exported as JSON (complete) or CSV (one line per shot),
  and imported again. Selecting a shot shows its trace on the target and diagrams of X, Y and trigger force
  over time.
- **Targets and printing** prints a target or the calibration sheet scaled to your real distance.
- **Device settings** (see below) changes the shot sensitivity, the radio channel and the calibration, and
  edits every stored variable, with automatic backups.
- **Technical details** shows link and pairing state, the live raw sample, traffic counters, the USB
  descriptor, every known variable of receiver and sensor, and a rolling packet log with decoded text.

Saved sessions live in that browser's storage only. Export what you want to keep.

### Live output to other software

The page can send positions, shots and the open session to another program while you shoot. Enter the
address of a WebSocket server (`host:port`) and tick **Stream**; the page connects out to it, so no server
belongs to the page itself. `node tools/ws-receiver.js` is an example receiver.
Details and message format: [docs/streaming.md](docs/streaming.md).

### If the aim point moves the wrong way

The software does not know how the sensor is mounted. Change **Mount angle** in 90° steps until moving the
gun right moves the dot right; if no angle fits, toggle **New formula**. **Centre on shots** moves the centre
to the mean of the shots fired so far.

### Device settings

**These functions write into the receiver and the gun sensor. They follow what the original software does
but have not been tested on real hardware.** A wrong value can make the sensor unreachable or the system
unusable until the old values are written back. Every write needs confirmation; radio channel, calibration
and the variable editor need an extra acknowledgement.

- **Backups:** the stored settings are saved in the browser whenever they are read and differ from the last
  backup, and again right before every write. Backups can be exported, imported and written back with
  **Restore**. Export one to a file before changing anything.
- **Shot detection sensitivity:** in use, and optionally as power-on default.
- **Radio channel:** change it on both units (sensor first, then receiver), or search channels 1–4 when the
  sensor is not reachable.
- **Calibration:** aim at the five marks of the printed calibration sheet. The result (rotation, zoom, centre)
  can be used in this page only, which writes nothing, or written to the sensor.
- **Stored variables:** every stored setting of both units, with the allowed ranges from the original software.

## Command line

Needs Node.js (tested with version 22).

    npm install
    node cli.js info                  # USB details and every variable of receiver and sensor
    node cli.js stream 30 > aim.csv   # 30 s of samples as CSV; shots are printed on stderr

Add `--log` for a decoded packet log on stderr.

## One-time setup

- **Linux:** `sudo cp 70-sam-funktrainer.rules /etc/udev/rules.d/ && sudo udevadm control --reload`, then
  replug the receiver. Chromium installed as a snap also needs `sudo snap connect chromium:raw-usb`.
- **Windows:** bind the generic WinUSB driver to the receiver once, for example with
  [Zadig](https://zadig.akeo.ie/). Untested.
- **macOS, Android:** nothing should be needed. Untested.

## Development

    npm test          # self-check of parsing, scoring and filter
    npm run build     # regenerate sam-funktrainer.html from index.html + sam.js
    npm run web       # serve this folder on http://localhost:8000

| File | Purpose |
|---|---|
| `sam.js` | Protocol and math, shared by the page and the command line |
| `index.html` | The web page (source; works only when served) |
| `sam-funktrainer.html` | The page as one self-contained file, generated by `build.js` |
| `cli.js` | Command-line tool |
| `tools/demo.html`, `tools/fake-receiver.js` | The page running against a simulated receiver, for work without hardware: `npm run web`, then open `http://localhost:8000/tools/demo.html` |
| `tools/ws-receiver.js` | Example receiver for the live output |
| `.github/workflows/publish-app.yml` | On every push to `main`: runs the tests, builds the page and publishes it to mehmetahsen.de through the site repository |
| `tools/probe_*.py` | The step-by-step Python probes used to confirm the protocol (need `pyusb`) |
| `tools/ketk32_decode.py` | Decoder for the original software's script files |
| `70-sam-funktrainer.rules` | Linux udev rule for access without root |

### Session file format (JSON export)

    {
      "id": "…", "started": "2026-11-17T08:29:04.000Z", "name": "…", "target": "lg",
      "targetDef": { "name": "Air rifle 10 m", "rings": 10, "lowest": 1, "d10": 0.5, "ringWidth": 2.5, "black": 30.5, "pellet": 4.5, "dist": 10 },
      "shots": [ { "t": 1794900544000, "x": 4.92, "y": -1.49, "trace": [[-2990, 3.1, 0.2, 3], …, [0, 4.92, -1.49, 3], …] } ]
    }

`t` is the time of the shot in ms since 1970, `x` / `y` are mm on the target face (left and up negative), and
each trace row is `[ms relative to the shot, x, y, trigger force]` (older files have no force value).
`targetDef` is a copy of the target definition (sizes in mm, `dist` = nominal distance in m, `lowest` = lowest
scoring ring, optional `centre: true` = scored by the hole centre), so sessions on custom targets can be read anywhere.

## Licence

- Code (everything outside `docs/`): MIT, see [LICENSE](LICENSE).
- Documentation (`README.md` and `docs/`): Creative Commons Attribution 4.0, see [LICENSE-docs](LICENSE-docs).

Device serial numbers in the examples, the test and the simulator are made up.
