# USB protocol of the receiver

Everything a program needs to talk to the SAM-Funktrainer receiver (USB `0adc:0005`).

Evidence: **[hw]** observed on real hardware (receiver firmware 1.06, sensor firmware 1.08),
**[sw]** found by analysing the original Windows software and not yet seen on hardware.
A reference implementation is `sam.js`; `tools/probe_vars.py` is a second one in Python.

## USB interface [hw]

| Item | Value |
|---|---|
| Vendor / product | 0x0ADC / 0x0005 ("KE Knestel Elektronik GmbH", "SAM-Funktrainer") |
| USB version / speed | 1.00, full speed |
| Device class | 0xDC (diagnostic); interface class 0xDC, subclass 0xA0, protocol 0xB0 |
| Configuration | one configuration, one interface, four interrupt endpoints |
| Serial string | the receiver's serial number, five digits |
| Device version (bcdDevice) | the receiver's firmware version (1.06) |

| Endpoint | Direction | Max packet | Interval | Use |
|---|---|---|---|---|
| 0x02 | OUT | 64 bytes | 1 ms | all packets to the receiver |
| 0x82 | IN | 64 bytes | 1 ms | all packets from the receiver |
| 0x01 | OUT | 16 bytes | 10 ms | not used by the original software |
| 0x81 | IN | 16 bytes | 10 ms | not used; silent during 15 s of listening |

- No control transfers beyond standard enumeration are needed. The original kernel driver is a renamed copy
  of Microsoft's `bulkusb` driver sample and has no device-specific logic. [sw]
- The receiver answers neither the Microsoft OS string descriptor (index 0xEE) nor a BOS descriptor request,
  so Windows will not bind WinUSB by itself. [hw]
- One USB packet is one protocol packet. There is no framing, checksum or encryption on the USB side. [hw]

## Packet format

All multi-byte fields are **big-endian**. Every packet starts with a 16-bit packet type.

| Type | Name | Direction | Length | Evidence |
|---|---|---|---|---|
| `00 01` | READY | both | 2 | [hw] |
| `00 02` | NOT_READY | both | 2 | host to receiver [hw]; receiver to host [sw] |
| `00 03` | DUMMY | receiver to host | 2 | [sw], never seen |
| `00 04` | ACK | receiver to host | 4 | [hw] |
| `00 05` | NAK | receiver to host | 8 | [hw] |
| `00 06` | read receiver variable | request and reply | 8 | [hw] |
| `00 07` | write receiver variable | host to receiver | 8 | [sw], never sent by this project |
| `00 08` | read sensor variable | request and reply | 8 | [hw] |
| `00 09` | write sensor variable | host to receiver | 8 | [hw] (variable 0x64 only) |
| `00 0A` | measurement | receiver to host | 18 | [hw] |

### Link handshake [hw]

1. Host sends `00 01`.
2. The receiver answers `00 01` within about 2 ms, **twice**.
3. Before the host sends `00 01` the receiver is silent and sends nothing on its own.
4. When done, the host sends `00 02`. The receiver does not answer.

The original DLL forwards data to the application only after it has seen the receiver's `00 01`, treats a
received `00 02` as "link down", silently drops `00 03`, and waits 600 ms between opening the device and the
first write. [sw] The 600 ms wait was not found to be necessary. [hw]

### Variables

Both the receiver and the sensor expose numbered 32-bit variables. Requests to the sensor are relayed over
the radio by the receiver.

Read request (8 bytes):

| Offset | Size | Content |
|---|---|---|
| 0 | 2 | `00 06` (receiver) or `00 08` (sensor) |
| 2 | 2 | variable number |
| 4 | 4 | `FF FF FF FF` |

Read reply (8 bytes): same type and variable number, then the value as a signed 32-bit integer. [hw]

Write request (8 bytes): `00 07` (receiver) or `00 09` (sensor), variable number, value.
The reply is an ACK or a NAK.

ACK (4 bytes): `00 04` followed by two more bytes. For a write to the sensor these were `00 09`. [hw]

NAK (8 bytes):

| Offset | Size | Content |
|---|---|---|
| 0 | 2 | `00 05` |
| 2 | 2 | `00 06` after a failed receiver read, `00 09` after a failed sensor read or write [hw]; exact meaning unknown |
| 4 | 4 | reason code |

| Reason | Meaning | Evidence |
|---|---|---|
| 1 | sensor not reachable (off, out of range, other channel) | [hw] |
| 2 | sensor is streaming and cannot take a command right now | [hw] |
| 3 | no such variable | [hw] |

Replies arrive within a few milliseconds. The original software waits up to 5 s for a reply. [sw]
A reader should match replies to its request (type and variable number), because stale packets from an
earlier session can still arrive. [hw]

### Receiver variables

| Number | Name | Observed [hw] | Notes |
|---|---|---|---|
| 0x0000 | firmware version | 106 | 1.06; equals the USB device version |
| 0x0001 | radio channel, stored default | 1 | range 1..10 [sw] |
| 0x0002 | radio transmit power | 200 | range 0..255, documented default 128 [sw] |
| 0x0065 | radio channel in use | 1 | |
| 0x0067 | "sensor available" | 1 | read 1 even while the sensor was off; meaning unclear |
| 0x0069 | "HF quality" | 0 | the original software uses it as an on/off switch [sw] |
| 0x0950 | revision | NAK 3 | not present in firmware 1.06 |
| 0x0952 | number of stored variables minus 1 | 2 | so variables 0..2 are stored settings |
| 0x095E | serial number | 4711 | equals the USB serial string |

### Sensor variables

| Number | Name | Observed [hw] | Notes |
|---|---|---|---|
| 0x0000 | firmware version | 108 | 1.08 |
| 0x0001 | radio channel, stored default | 1 | range 1..4 [sw] |
| 0x0002 | shot-detection sensitivity, stored default | 75 | range 0..255 [sw] |
| 0x0003 | options | −1 | bit mask of unlocked options (force sensor, pulse meter) [sw]; the original software ignores it on USB and assumes both are present |
| 0x0004 | battery "low" threshold | 360 | unit 10 mV |
| 0x0005 | battery "off" threshold | 350 | unit 10 mV |
| 0x0006 | radio transmit power | 150 | range 0..255 [sw] |
| 0x0007 | unnamed | 0 | |
| 0x0008 | sensor rotation angle | 90 | degrees; used in the position math |
| 0x0009 | ADS1100 converter gain | 1 | development setting [sw] |
| 0x000A | ADS1100 converter sample rate | 32 | development setting [sw] |
| 0x000B | zoom X | −475 | scale factor of the position math; −475 is the factory default [sw] |
| 0x000C | zoom Y | −475 | |
| 0x0064 | streaming enable | −1 on read | write 1 to start, 0 to stop |
| 0x0065 | radio channel in use | 1 | |
| 0x0066 | shot-detection sensitivity in use | 75 | |
| 0x0067 | battery | 417 | low 31 bits: voltage in 10 mV; bit 31: battery low |
| 0x0068 | microphone test mode | −1 on read | the original software writes 1 while its settings page is open [sw] |
| 0x0950 | revision | −1 | |
| 0x0952 | number of stored variables minus 1 | 12 | so variables 0..12 are stored settings |
| 0x095E | serial number | 4711 | same as the receiver of the set |

Variables 0 to N are settings stored in the device (EEPROM), 0x64 and up are runtime state, 0x95x is
identity. Some runtime variables answer a read with −1 (0xFFFFFFFF) instead of a NAK.

### Streaming [hw]

- Start: write sensor variable 0x64 = 1 (`00 09 00 64 00 00 00 01`). Reply: ACK.
- Stop: write sensor variable 0x64 = 0. While the sensor streams it usually answers NAK 2. Repeat the
  command every 500 ms until the ACK arrives; this took 2 s (four NAKs) in one test. The original software
  does the same. [sw]
- While the sensor streams, every other request to it also gets NAK 2. Stop the stream before reading or
  writing sensor variables. Requests to the receiver itself still work.
- A program that exits without stopping leaves the sensor streaming. Send a stop (with retries) right after
  the handshake of the next session.

### Measurement packet (18 bytes) [hw]

| Offset | Size | Content |
|---|---|---|
| 0 | 2 | `00 0A` |
| 2 | 2 | always `00 00` so far; not used by the original software |
| 4 | 2 | status word |
| 6 | 2 | photodiode quadrant A |
| 8 | 2 | photodiode quadrant B |
| 10 | 2 | photodiode quadrant C |
| 12 | 2 | photodiode quadrant D |
| 14 | 2 | trigger force, second channel |
| 16 | 2 | pulse word |

Status word [sw], partly [hw]:

| Bits | Meaning |
|---|---|
| 0–9 | trigger force, first channel (reads 3 with no force sensor fitted [hw]) |
| 10 | shot detected |
| 11 | battery low (seen set at 3.55 V [hw]) |
| 12–15 | unknown |

Pulse word [sw]: `FF FF` means no pulse sensor (seen [hw]); otherwise bit 15 marks a heartbeat and bits 0–14
are the heart rate.

Example: `00 0a 00 00 08 03 06 99 03 b9 16 67 16 e8 03 e1 ff ff` is battery low, force 3,
A = 1689, B = 953, C = 5735, D = 5864, second force 993, no pulse sensor.

Observations [hw]:

- Packets are 10 ms apart. With no target in view, 400 packets arrived in 4.0 s. With the target in view
  only about 80 to 83 per second arrived (two separate runs), so intervals go missing. The cause is unknown.
- The first packets after a start (about 0.1 s) are all zeros.
- With the sensor not pointed at the target, the quadrant values were 0 for a whole 4 s run.
- Quadrant values above 6000 occurred in one run; the original software calls anything above 5000 overdriven.
- The packet carries no timestamp or sequence number; the host has to timestamp on arrival.

## Sequences used by the original software [sw]

**Start-up:** handshake, wait 2 s, write sensor 0x66 (sensitivity in use). Then read the receiver's serial
and channel, and the sensor's serial, angle (0x08), battery (0x67) and zoom (0x0B, 0x0C).

**Change radio channel:** write sensor 0x65 = channel; if that is acknowledged, write receiver 0x65 = channel.
The sensor has to be told first, while it can still be reached on the old channel.

**Search for the sensor's channel:** for each channel 1..4, write receiver 0x65 = channel and read sensor
0x65; the channel is found when the sensor answers with the same number.

**Store a channel permanently:** write the stored defaults as well (sensor 0x01, receiver 0x01).

**Change sensitivity:** write sensor 0x66 (in use) and sensor 0x02 (stored default).

**Store calibration:** write sensor 0x08 (angle in degrees) and 0x0B / 0x0C (zoom, truncated to integers).

None of the write sequences except streaming start/stop have been tried on hardware by this project.
Writing stored settings changes the device permanently; read and note the old values first.

## Example session [hw]

Log of `node cli.js info --log` with the sensor switched off:

```
TX   00 01                    READY (link up)
 RX  00 01                    READY (link up)
TX   00 09 00 64 00 00 00 00  write sensor 0x0064 streaming enabled = 0
 RX  00 01                    READY (link up)
 RX  00 05 00 09 00 00 00 01  NAK 1: sensor not reachable
TX   00 06 00 00 ff ff ff ff  read receiver 0x0000 firmware version
 RX  00 06 00 00 00 00 00 6a  receiver 0x0000 firmware version = 106
TX   00 06 09 50 ff ff ff ff  read receiver 0x0950 revision
 RX  00 05 00 06 00 00 00 03  NAK 3: no such variable
TX   00 06 09 5e ff ff ff ff  read receiver 0x095e serial number
 RX  00 06 09 5e 00 00 12 67  receiver 0x095e serial number = 4711
TX   00 02                    NOT_READY (link down)
```

Start of a stream with the sensor on:

```
TX   00 09 00 64 00 00 00 01  write sensor 0x0064 streaming enabled = 1
 RX  00 04 00 09              ACK
 RX  00 0a 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff ff
 ...
 RX  00 0a 00 00 08 03 06 99 03 b9 16 67 16 e8 03 e1 ff ff
```

## Minimal recipe

1. Open `0adc:0005`, select configuration 1, claim interface 0.
2. Start reading endpoint 0x82 continuously with 64-byte requests.
3. Write `00 01` to endpoint 0x02 and wait for `00 01`.
4. Write `00 09 00 64 00 00 00 00` and repeat every 500 ms while the answer is NAK 2 (NAK 1 means no sensor).
5. Read the variables you need.
6. Write `00 09 00 64 00 00 00 01` and process the measurement packets.
7. To finish: stop the stream as in step 4, then write `00 02`.
