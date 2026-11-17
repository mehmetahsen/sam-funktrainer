# The SAM-Funktrainer system

The SAM-Funktrainer ("SAM wireless trainer", also sold as SAM-Trainer 2) is a training analysis system for
rifle and pistol shooters, built by KE Knestel Elektronik GmbH and sold by DISAG. It records where the gun
points before, during and after a dry-fire or live shot and scores the shot on a virtual target. According to
Knestel it was developed in 2003. DISAG lists its Windows software (last version 2.21.004, 2015) as
unsupported, for Windows XP to 8.

Sources are marked: **[hw]** observed on real hardware by this project, **[sw]** found by analysing the
original software, **[doc]** vendor manual or help file, **[user]** reports from owners.

## Components

| Part | What it does |
|---|---|
| Target unit | Holds a paper target and carries two infrared LEDs that emit modulated light. Powered by a 5 V supply. Has a near/far switch (6 m) that changes LED power. [doc] |
| Gun sensor | Clamped to the gun. Contains a four-quadrant infrared photodiode that sees the target's LEDs, an accelerometer that detects the trigger click, a Li-Ion battery and a 433 MHz radio. About 75 g. [doc] |
| USB receiver | 433 MHz radio to the sensor, USB to the PC. Bus powered (90 mA). [hw] |
| Trigger-force sensor (optional) | Taped to a pistol trigger and wired to the gun sensor. [doc] |
| Pulse sensor (optional) | Heart-rate sensor with its own radio link to the receiver. [doc] |

## How a measurement happens

1. The gun sensor's photodiode has four quadrants (A, B, C, D). The image of the target's LEDs falls on them;
   how the light splits between the quadrants gives the angle between the gun and the target. [sw]
2. The sensor digitises the four quadrant signals and sends them by radio, nominally 100 times per second,
   together with a status word, trigger-force values and the pulse value. [hw]
3. The receiver passes each radio packet to the PC as one USB packet. [hw]
4. The PC software does all the math: filtering, conversion to millimetres on the target, shot scoring. The
   sensor sends raw quadrant values, not positions. [hw] [sw]
5. The sensor detects the shot itself (accelerometer, adjustable sensitivity) and reports it as one bit in
   the status word. The PC takes the aim point at that moment as the hit. [sw] (the bit was not yet seen set
   on hardware by this project)

The sensor streams only while the PC has switched streaming on. [hw]

## Radio

- 433 MHz LPD band, at most 10 mW, bidirectional. [doc]
- Selectable channel so that several systems can work side by side. The manual says channels 1 to 10; the
  receiver's setting allows 1 to 10, but the sensor's setting and the original software's channel search
  only cover 1 to 4. [doc] [sw]
- Receiver and sensor must be on the same channel. The receiver and sensor of one set carry the same serial
  number. [hw]
- Transmit power is a stored setting on both sides (0 to 255). [hw]

## Power and indicators

- Sensor battery: Li-Ion, about 10 hours of use, about 1 hour to charge from the 5 V supply. [doc]
- The sensor stores a "low" threshold (3.60 V) and an "off" threshold (3.50 V) and reports its voltage and a
  low-battery flag. [hw]
- Sensor LED: five blinks at power-up; a short blink for each successful radio exchange. [doc]
- Receiver LED: five blinks when plugged in; blinks per received packet; lit while the gun points at the
  target. [doc]

## Using it

- Distance to the target is free; owners report it working from about 4 m to 10 m. [user]
- Below 6 m the target unit's switch should be on "near", otherwise the photodiode is overdriven. The original
  software treats quadrant values above 5000 as overdriven. [doc] [sw]
- Calibration in the original software, in the order owners actually use it [doc] [user]:
  1. Tell the software where the sensor is mounted (rotation angle).
  2. "Quick adjustment": fire some shots at the centre; their mean becomes the centre offset.
  3. During training, "centre on shots so far" corrects the offset again.
  4. A full calibration with a printed five-mark sheet determines scale and rotation. The vendor advises
     against it for normal use.
- Known weakness: the rotation angle has no defined reference on the gun, so owners had to find a working
  angle by trial (values such as 261° or 315° for a straight mount were reported). [user]
- The shot detector can trigger on loading the gun; lowering the sensitivity helps. [user]

## What the original software offers

Listed so that a replacement knows what users expect. [doc]

- Live aim trace on the target, zoom, shot display with spoken ring value.
- Series of N shots with saving; free training without saving.
- Recording window around each shot (default 7.5 s before, 0.5 s after).
- Analysis: trace replay, X/Y over time, trigger-force curve, ring versus aim time, time inside the 10,
  speed at release, holding area, "what if the shot broke t ms earlier or later".
- Rapid-fire timing mode, stopwatch.
- Shooter database, competitions, rank lists, series export and import, ASCII export.
- Ten target types (air rifle, air pistol, small bore, running target, 25 m pistol variants, large bore).

## Related hardware

- **SAMulator** (USB product ID 0x0006): a sibling product. Its software contains the same protocol
  constants and its driver is the same code with other names, so this project's protocol description very
  likely applies to it too. [sw] Not tested on hardware.
- **SAM-Trainer 1**: the older cabled version on the parallel port. Different electronics, 12-bit values;
  not covered here.
