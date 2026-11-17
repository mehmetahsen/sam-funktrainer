# The original Windows software and its files

Notes for anyone who wants to dig further, import old data, or check this project's findings. Based on
SAM-Funktrainer 2.21.004 (installer dated 2015) and SAMulator 1.03.017, both downloadable from DISAG.
None of the original software is included in this repository.

## Structure

| File | Role |
|---|---|
| `SAM-Trainer.exe` | Hardware access and number crunching: USB protocol, position math, filter, ring calculation. |
| `KEVisual32.dll` | "KE-Visual", Knestel's script runtime. Draws the whole user interface and runs the scripts. |
| `Tokenfld/*.tks, *.tkd, *.tkl, *.tkp` | The application itself as compiled KE-Visual scripts (training, analysis, calibration, settings). |
| `usbtrn32.dll` | Thin user-mode layer over the driver: open, close, read packet, write packet. |
| `Drv/usbtrn32.sys` (+ amd64, ia64, Win98 builds) | Kernel driver. |
| `Include/*.H` | Plain-text C headers with the scripts' constant names (variables, flags, modes). Very useful. |
| `*.INI`, `Demo/*.DBF`, `Demo/PLOTS/*.PLT` | Settings, demo database, demo aim traces. |
| `Help/*.HLP` | WinHelp manuals (German, English). |

How the pieces talk:

- The exe loads `usbtrn32.dll` at run time and registers five callbacks with KEVisual32.dll.
- Scripts reach the hardware only through four script functions: run an application procedure, call an
  application function, read an external variable, write an external variable.
- The exe has one table of hardware functions with two implementations: parallel port (SAM-Trainer 1) and
  USB. Scripts use logical variable numbers; the exe translates them to the firmware numbers listed in
  [protocol.md](protocol.md) for the device in use.
- On USB the exe never asks the device for the option bits or for per-channel offsets; it assumes both
  options (force sensor, pulse meter) are present and offsets are zero.
- A thread polls for a measurement packet every 10 ms and takes at most one per poll.

## Driver

- The kernel driver is Microsoft's `bulkusb` sample from the Windows DDK with the names changed. It exposes
  the endpoints as numbered pipes and has no device-specific code and no vendor requests.
- `usbtrn32.dll` opens pipe 2 (endpoint 0x82) for reading and pipe 3 (endpoint 0x02) for writing, performs
  the READY handshake, and queues packets in both directions. It adds no checksum or transformation.
- DLL behaviour worth knowing: 600 ms wait after opening, 500 ms write timeout, 1 s wait for the receiver's
  READY, automatic reconnect attempts every 500 ms after a failure.
- The driver package is dated December 2009 (version 3.0, first with 64-bit builds).

This is why a generic driver (WinUSB on Windows, nothing at all on Linux and macOS) is sufficient.

## KETK32 script files

The scripts are neither compressed nor encrypted. `tools/ketk32_decode.py` turns them into readable text.

Header (0x7A bytes): magic `KETK32`, a 16-bit format version (0x014F), a compile time, the size of the token
stream at offset 0x14, and the module name at offset 0x22.

Token stream, from offset 0x7A: records of

| Size | Field |
|---|---|
| 2 | token number |
| 4 | source line number |
| 4 | body length |
| 1 | flags |
| n | body: arguments as an expression in infix token form |

- The first record is token 0x7FFE, the last 0x7FFF.
- **Token names are not in the script files.** They are the string resources of `KEVisual32.dll`: the string
  with ID n is the name of token n (about 1670 entries, for example 0x1900 `if(`, 0x2500 `UserVar(`).
- Inside expressions: 0x3600 = 64-bit float constant, 0x3601 = 32-bit integer constant, 0x1B01 = string with
  length prefix, 0x3602 = nested expression with length prefix, 0x1605 = local variable index, 0x1119 = end
  of argument.
- A few comparison and logic operators have no string resource; the decoder names them from context.

After the token stream come sections marked `*Stringtable***`, `*Includes******`, `*Procedures****` and
others. The string table holds display texts; in the `Var*.tkd` files these are the names, ranges and
defaults of the device's stored variables, which is where the variable names in this project come from.

The decoder handles 56 of the 61 script files of version 2.21.004 to the end; five stop early at operand
types it does not know, and one older file uses a different layout.

## Aim trace files (`*.PLT`)

Little-endian.

| Offset | Size | Content |
|---|---|---|
| 0 | 2 | `00 01` |
| 2 | 4 | length L of the sample data in bytes |
| 6 | 4 | offset of the sample data (14) |
| 10 | 4 | offset of the trailer (14 + L) |
| 14 | L | samples |
| 14 + L | 2 | buffer capacity in samples (recording window / 10 ms) |
| + 2 | 2 | number of samples N |
| + 4 | 6 | zero |
| + 10 | 4 | N − 1 |
| + 14 | 4 | element size: 8 or 2 |
| + 18 | 6 | zero |

- Element size 8: **position trace**, each sample is two 64-bit floats (x, y) in mm on the target face,
  centre at 0, left and up negative.
- Element size 2: **force trace**, each sample is two signed 16-bit integers: time in ms relative to the
  shot (0 = the shot sample) and the raw force value. This file is the only place where sample times are
  stored; the position file of the same shot has the same number of samples.
- Samples are 10 to 11 ms apart.

Checked on the 25 demo shots that ship with traces: the stored hit position equals the position sample at
time 0 in every case.

## Database (`*.DBF`, dBase III with `.DBT` memo files)

| File | One row per | Key fields |
|---|---|---|
| `Main.dbf` | installation (single row) | radio channel, recording window, sensitivity, offsets, zoom, rotation, colours, options |
| `SERIE20.DBF` | series | `IDENT_NR`, shooter, date, time, target type, shot count, ring sums with and without tenths, best Teiler |
| `ABLAUF20.DBF` | shot | `SERIE_ID`, `SCHUSS_NR`, aim time, rest time, follow-through time, `POS_X`, `POS_Y` (mm), `RINGE`, `TEILER`, and the 8-character names of the trace files in `POS`, `DRUCK` (force), `FUSS` |
| `Schuetze.dbf` | shooter | name, sex, trainer, club, association |
| `WAFFE.DBF` | target type | ring counts and diameters, ring width, pellet diameter, nominal distance, centre scoring flag |
| `WETTKMPF.DBF` | competition | name, target types, series size, rating method |

`DATABASE.INI` in the installation maps every field to the script variable it holds. Trace files live in the
`Plots\` folder. Databases written before version 2.0 use other file names and integer positions.

## ASCII export of the original

- `SERIEASC.INI`: one section per series with date, time, ring sums, shooter data, target dimensions, and per
  shot `PositionX`, `PositionY` (mm) and `ShotTime` (ms since start of recording).
- `<series>_<shot>.CSV`: one line per sample, `Time;X;Y;Flag;` with flag 0 before the shot, 2 at the shot,
  1 after it.

## Version history (from the release notes)

| Version | Notable changes |
|---|---|
| 1.04–1.12 | Parallel-port trainer only; old database format |
| 2.00 | Support for the wireless trainer on USB; pro mode; rapid fire; pulse recording |
| 2.10 | More analysis views; ten target types; centre scoring for large bore |
| 2.11 | Fix for targets with a nominal distance other than 10 m |
| 2.20 | Competition administration |
| 2.21.004 | Last build (2015); listed by DISAG for Windows XP, Vista, 7 and 8 |

## How this was worked out

- Unpacked the installers (they are NSIS archives) and read the plain-text headers and INI files first.
- Disassembled and decompiled `usbtrn32.dll`, the driver and `SAM-Trainer.exe` (capstone, Ghidra) to find the
  packet layouts and the math.
- Decoded the scripts with the method above to find the sequences and the calibration procedures.
- Decoded the demo data files by inspection and cross-checked them against each other.
- Confirmed the protocol step by step on a real receiver and sensor, starting with listening only, then the
  handshake, then read-only requests, then streaming.
