# F110211 Flight Diagnostic

Inputs:

- `data/F110211.BIN`: aircraft binary SD log
- `data/F110211_G.CSV`: ground-station CSV log
- Flight time: 2026-07-11 02:11:37 to 02:22:55 UTC
  (12:11:37 to 12:22:55 AEST)

## Overall Result

The BNO08x, BME280, GNSS, aircraft SD card, SX1262 air link, and ground-station
logging all worked during the flight. The recorded BNO attitude is valid but is
expressed in the side-mounted PCB frame. The aircraft navigation EKF diverged
and must not be used for this flight; the raw GNSS track and barometric height
are the meaningful position sources.

## Aircraft Log

- 13,773 binary records were recoverable; 13,772 contain the complete fields
  required by the visualizer.
- Duration: 679.331 s.
- Actual average logging rate: 20.27 Hz; median interval: 50 ms; 95th
  percentile interval: 82 ms.
- Configured target at the time: 40 Hz (25 ms).
- Final overrun counter: 13,402. SD write errors: 0.
- BNO usable on every normalized aircraft row, with a median of two IMU samples
  aggregated per record and no BNO resets.
- Raw mounting pose near the start: roll -84.18 deg, pitch 7.53 deg, yaw
  -107.61 deg. Flight-wide median roll was -79.80 deg, confirming the side
  mounting rather than an IMU failure.
- BME altitude: 123.11 to 260.38 m; temperature: 19.73 to 28.52 C.
- GNSS fix throughout the usable log, 6 to 16 satellites (median 13), median
  horizontal accuracy estimate 1.18 m and 95th percentile 1.53 m.
- GNSS altitude: 200.27 to 330.57 m.
- GPS-derived peak ground speed: 37.98 m/s (136.7 km/h).
- Horizontal ground track: 6,785.42 m.
- Local track bounds from the first fix: 111.96 m west to 170.27 m east, and
  0.17 m south to 342.90 m north.

Absolute BME altitude depends on the configured sea-level pressure. Use its
relative changes for flight height unless it is field-calibrated. GNSS
vertical position is noisier, so the 3D replay defaults to GNSS east/north and
barometric height.

## Ground Link

- 8,741 packets logged over 678.384 s, averaging 12.88 received packets/s.
- No sequence reversals or receiver restart were present.
- 4,582 transmitted sequence numbers were missing across 1,454 gap events.
- RSSI: -106 to -33 dBm, median -82 dBm.
- SNR: -3.75 to 9.75 dB, median 8.25 dB.
- Max-power profile (22 dBm, 100 ms request): 670 packets, 8.24 packets/s.
- High-rate profile (22 dBm, 20 ms request): 8,071 packets, 13.49 packets/s.
- The aircraft SD-logging flag was asserted for the whole ground log.

The link remained usable and preserved a complete enough recovery track, but
the high-rate profile did not produce 50 received packets/s and increased the
number of disposable packet gaps. Ten hertz remains the better live-flight
setting unless a controlled range test demonstrates a reason to trade margin
for rate.

## Invalid Or Absent Data

- Aircraft EKF final horizontal uncertainty: 426.53 m.
- Aircraft EKF final velocity uncertainty: 23.05 m/s; recorded EKF speed also
  contained implausible spikes. Do not use the EKF path for this flight.
- Digital and analog airspeed channels were not valid.
- HX711 reported the expected unloaded/saturated state.
- No useful ESC telemetry was present.

## Changes Applied After This Flight

- Aircraft SD writes are now buffered in groups of eight records and file
  synchronization remains periodic. Sensor capture and local logging run
  before radio service. This targets 40 Hz without a small card transaction on
  every sample and limits the unsent RAM tail to about 200 ms.
- The IMU installation bias is removed in the body frame before world-frame
  rotation.
- EKF position, altitude, and velocity flags now have uncertainty and
  plausibility gates. An unhealthy EKF is re-anchored from the next valid GNSS
  update instead of continuing to publish divergent values.
- The offline visualizer now prefers valid GNSS horizontal position over EKF
  output and uses smoother barometric height.
- Receiver OLED/WiFi attitude can capture a persistent display-only mounting
  correction. The PC dashboard has equivalent browser-local controls.
- The interactive replay defaults to a three-second quaternion auto-level and
  retains a raw-IMU option. No recorded data is altered.

The updated aircraft firmware was built and flashed successfully over ST-Link.
The receiver firmware was subsequently flashed and verified over COM9. A live
post-flash sample confirmed continuous BNO and BME validity, receiver SD
logging, forward-only packet sequences, and successful receiver reacquisition
after the aircraft was reset. A named `BENCH3` session then opened both SD
loggers through the PC dashboard and reverse LoRa command path in 946 ms;
aircraft status reached `0x07`, and both loggers stopped cleanly in 323 ms. The
aircraft BNO acquisition was subsequently changed to poll SH-2 directly rather
than gate every read on PC6/H_INTN, and recovery retries no longer stop after
two failures. A 150-second post-flash hold then produced 146/146 fresh samples
with continuous BNO and BME validity and no recovery stage. The new aircraft SD
rate and EKF recovery still require inspection of a fresh aircraft binary log
before the next flight.
