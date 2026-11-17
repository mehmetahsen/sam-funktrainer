# Live output to other software

The page can send everything it measures to another program while you shoot. The page stays a static file:
it connects **out** to a WebSocket server that the other program provides. Nothing is hosted by this project.

## Using it

1. Start the receiving program. `tools/ws-receiver.js` is a ready-made example that prints what arrives:

       npm install
       node tools/ws-receiver.js 8765

2. In the page, under **Live output to other software**, enter the receiver's address as `host:port`
   (for example `localhost:8765` or `192.168.1.20:8765`) and tick **Stream**.
3. The page reconnects every 2 seconds if the receiver is not running or goes away.

The address and the position rate are remembered in the browser.

### Which addresses a browser allows

| Page opened from | Allowed |
|---|---|
| disk (`sam-funktrainer.html`) | any `ws://` or `wss://` address |
| an `https://` site | `wss://` addresses, and `ws://localhost`; plain `ws://` to another machine is blocked by the browser |

To reach another machine on the local network, open the page from disk.

## Messages

Each WebSocket message is one JSON object with a `type`. Format version 1.
Positions are in mm on the target face, centre (0, 0), left and up negative. Times are ms since 1970 (UTC).

### `hello`
Sent first after every (re)connection.

    {"type":"hello","software":"sam-funktrainer","format":1}

### `status`
Sent after `hello` and whenever the device state changes (connect, disconnect, variables re-read).

    {"type":"status","receiver":true,"sensor":true,"streaming":true,
     "receiverSerial":4711,"sensorSerial":4711,"receiverFirmware":1.06,"sensorFirmware":1.08,
     "batteryVolts":4.17,"batteryLow":false}

| Field | Meaning |
|---|---|
| `receiver` | the USB receiver is connected to the page |
| `sensor` | the gun sensor answered by radio at the last read |
| `streaming` | the sensor has been told to send measurements |
| others | `null` while unknown |

### `session`
The open session with all its shots. Sent after `status` on connection and again whenever the session
changes: new or opened session, renamed, target changed, shot added or deleted, centre moved.
A receiver can simply replace what it knows with the latest `session` message.

    {"type":"session","id":"bdf27e38-…","started":"2026-11-17T07:48:18.026Z","name":"stream test","target":"lg",
     "shots":[{"n":1,"t":1794901703898,"x":4.87,"y":-1.58,"ring":8.9}]}

`target` is `lg` (air rifle 10 m) or `lp` (air pistol 10 m).

### `shot`
Sent at the moment a shot is detected, before the following `session` message.

    {"type":"shot","session":"bdf27e38-…","n":1,"t":1794901703898,"x":4.87,"y":-1.58,"ring":8.9}

### `sample`
The current aim point, at the rate chosen in the page (100, 20 or 10 per second, or none).

    {"type":"sample","t":1794901703000,"valid":true,"overdriven":false,"x":2.51,"y":1.98,
     "a":1991,"b":2008,"c":2008,"d":1991,"force":3,"force2":993,"pulse":null}

| Field | Meaning |
|---|---|
| `valid` | the sensor sees the target; `x` and `y` are `null` otherwise |
| `overdriven` | signal too strong (too close, or target unit on "far") |
| `a`..`d` | raw photodiode quadrant values |
| `force`, `force2` | raw trigger-force channels |
| `pulse` | heart rate, `null` without a pulse sensor |

## Behaviour to rely on

- `shot`, `session`, `status` and `hello` are always sent while connected. `sample` messages are dropped if
  the receiver is not keeping up (more than 256 kB waiting), so a slow receiver cannot stall the page.
- Messages produced while there is no connection are not queued. After a reconnect the `session` message
  brings the receiver up to date on shots; positions from the gap are lost.
- The page sends only; anything the server sends back is ignored.
- Aim traces of individual shots are not sent as such; a receiver that wants them keeps the `sample`
  messages around each `shot`.
