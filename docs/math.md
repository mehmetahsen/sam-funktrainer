# From photodiode values to a scored shot

The receiver delivers raw values; all processing happens on the PC. This page describes the processing of
the original Windows software, reconstructed by analysing it. `sam.js` implements the same steps.

**Nothing on this page has been checked against the original software's output on the same input.**
The formulas were read from machine code and scripts. One recorded shot from the original's demo database
reproduces the ring formula (see "Scoring").

## Signal chain

For every measurement packet (nominally 100 per second), with quadrant values A, B, C, D:

1. **Plausibility.** The target is "in view" when all four values are above 300. Any value above 5000 counts
   as overdriven (too close, or target unit on "far"). These limits are what the original uses for the USB
   version; another constant in its headers gives 6600 as the maximum.
2. **Optional recoil hold ("icicle sieve", off by default).** For the first two packets after the shot bit
   appears, A..D are replaced by the previous packet's values.
3. **Low-pass filter**, one per quadrant channel (on by default). See "Filter".
4. **Raw position** from the filtered values. The original has two formulas and a switch between them;
   which one is active by default could not be determined.

   | | "Old" formula | "New" formula |
   |---|---|---|
   | x | (D − B) / (D + B) | (C + D − A − B) / (A + B + C + D) |
   | y | (C − A) / (C + A) | (B + C − A − D) / (A + B + C + D) |

   Read as geometry, the old formula measures along the two diagonals of the photodiode and the new one
   along its sides, so the two would differ by a 45° rotation and a scale factor. This is an interpretation
   of the formulas, not something the original documents.
5. **Rotation** by the angle φ = (mounting angle chosen by the user + sensor variable 0x08), in degrees:

       x' = x·cos φ − y·sin φ
       y' = x·sin φ + y·cos φ

6. **Millimetres on the target face:**

       X = zoomX · x' · (nominal distance / 10 m) − offsetX
       Y = zoomY · y' · (nominal distance / 10 m) − offsetY

   - zoomX, zoomY: sensor variables 0x0B and 0x0C (factory default −475 each).
   - nominal distance: the distance the target type is defined for (10 m for air rifle and air pistol), not
     the real distance. Training at a shorter distance uses a proportionally smaller printed target.
   - offsetX, offsetY: the centre correction in mm from the quick adjustment, kept on the PC.
   - Sign convention of the result: X < 0 is left, Y < 0 is up.
7. **Shot.** On the rising edge of the status word's shot bit, the position computed from that same packet
   is the hit. The original also keeps a "new shot allowed" flag to suppress repeats.

## Filter

Second-order low-pass, designed with the bilinear transform. Defaults: Bessel characteristic, cut-off
f = 4 Hz, sample rate fs = 100 Hz.

    W  = 1 / tan(π · f / fs)
    D  = 1 + a·W + b·W²
    y[n] = (x[n] + 2·x[n−1] + x[n−2]) / D − 2·(1 − b·W²)/D · y[n−1] − (1 − a·W + b·W²)/D · y[n−2]

| Characteristic | a | b |
|---|---|---|
| Critical damping | 1.2872 | 0.4142 |
| Bessel (default) | 1.3617 | 0.6180 |
| Butterworth | 1.4142 | 1.0 |
| Chebyshev 0.5 dB | 1.3614 | 1.3827 |

The original rounds the filter output to an integer and bypasses the filter for input values of 3 or less.
`sam.js` does neither.

The default filter delays the aim point by roughly 50 ms (its group delay), and the hit is taken from the
filtered position. Whether the vendor compensated for this elsewhere is not known.

## Scoring

With r = √(X² + Y²) in mm, and for a target with N rings, ten-ring diameter D10, ring width W and pellet
diameter d:

    R10  = (D10 + d) / 2
    ring = N + 1 − r / R10            if r ≤ R10
    ring = N − (r − R10) / W          otherwise
    ring is cut (not rounded) to one decimal; below 1 it is 0; the maximum is N + 0.9

For targets scored by the pellet centre (the large-bore types) d is taken as 0.

The original also stores the "Teiler" = 100 · r, the distance from the centre in 1/100 mm.

Check against the original's demo data: an air-pistol shot stored at (16.78, 37.11) mm, r = 40.73 mm, has
ring value 5.9 in the database; the formula gives 10 − (40.73 − 8.0) / 8 = 5.909, cut to 5.9.

Target dimensions from the original's database (mm):

| Target | Total Ø | Black Ø | Ten Ø | Ring width | Pellet Ø | Nominal distance |
|---|---|---|---|---|---|---|
| Air rifle | 45.5 | 30.5 | 0.5 | 2.5 | 4.5 | 10 m |
| Air pistol | 155.5 | 59.5 | 11.5 | 8 | 4.5 | 10 m |
| Small bore | 154.4 | 112.4 | 10.4 | 8 | 5.58 | 50 m |
| Zimmerstutzen | 85.5 | 40.5 | 4.5 | 4.5 | 4.5 | 15 m |
| Running target | 50.5 | 30.5 | 5.5 | 2.5 | 4.5 | 10 m |
| Rapid-fire / sport pistol duel | 500 | 500 | 100 | 40 | 5.6 | 25 m |
| Sport pistol precision | 500 | 200 | 50 | 25 | 5.6 | 25 m |
| Large bore precision | 500 | 200 | 50 | 25 | 10 | 25 m (centre scoring) |
| Large bore duel | 500 | 500 | 100 | 40 | 10 | 25 m (centre scoring) |

## Calibration procedures of the original software

All of them work on the rotated raw position (x', y') captured at shots or button presses.

**Reset to defaults:** zoom X = zoom Y = −475, offsets 0, mounting angle 0, sensitivity 75; the zoom values
and the sensitivity are written to the sensor.

**Quick adjustment (centre on a group):** offset = mean over the shots of raw position × zoom × (nominal
distance / 10). This is the normal way to zero the system.

**Point adjustment:** the user clicks where a shot really landed; offset = raw × zoom − clicked position.

**Mounting angle:** a fixed 0°, 90°, 180° or 270°, or a free angle set on a separate adjustment page.

**Five-mark calibration sheet** (marks 50 mm left, right, above and below the centre at 10 m, scaled for
other distances). With the mean raw positions at the four outer marks, (x1, y1) top, (x2, y2) bottom,
(x3, y3) left, (x4, y4) right:

    zoomX = 100 / (x4 − x3)        zoomY = 100 / (y1 − y2)
    angle = average of  atan((x1 − x2) / (y1 − y2)) + 135°  and  135° − atan((y4 − y3) / (x4 − x3))

The angle and the zoom values (truncated to integers) are then written to the sensor.
The script that stores this calibration writes the Y offset into the X offset variable and never sets the Y
offset, which looks like a bug in the original.

**Shooting calibration on a five-bull target** (up to 20 shots per bull): zoom from the distance between the
mean positions of opposite bulls (100 mm apart), offset from the mean at the centre bull.

## Trigger force and pulse

- The training display plots the first force channel (status word bits 0–9) over time.
- The hardware test page of the original shows the second channel as `min(250 − value, 250) / 2.5` percent.
- Which channel is the physically meaningful one is not known; no force sensor was available to this project.
- Heart rate is the low 15 bits of the pulse word.
