# Skylabs Flight Review

`/projects/skylabs/flight-review/` is a static, browser-only flight-log review tool. Files selected by the user remain in browser memory; the site has no upload endpoint.

## Supported inputs

### Skylabs binary

The parser accepts `SKYLBIN1` aircraft SD logs using schema versions 1–3:

| Version | Record size | Notes |
| --- | ---: | --- |
| 1 | 238 bytes | Core barometer, BNO08x, GNSS, ESC and EKF fields |
| 2 | 250 bytes | Version 1 plus HX711 fields |
| 3 | 282 bytes | Version 2 plus airspeed and MPXV diagnostic fields |

All values are read little-endian using the offsets defined by `tools/telemetry_binary.py` in the Skylabs firmware repository. The browser validates the magic, header size, schema version and record size before reading records.

### Excel and CSV

The first populated worksheet is used. Header matching is case-insensitive, ignores punctuation, and recognizes the aliases shown in the UI.

Minimum columns:

- `time_s`, `time_us` or `timestamp_ms`
- `gnss_lat` and `gnss_lon` in decimal degrees

Recommended columns:

- `altitude_m` for barometric altitude
- `gnss_alt_m` for absolute GNSS altitude
- `roll_deg`, `pitch_deg` and `yaw_deg`

Optional engineering channels include `airspeed_mps`, `gnss_siv`, `gnss_h_acc_m`, `log_dt_ms`, ESC telemetry, EKF uncertainty, IMU sample count and SD logging counters. The page can download a CSV template containing the preferred headers.

## Google Maps 3D

The local Three.js replay works without credentials. Google Maps 3D is optional and requires a browser key with billing and the Maps JavaScript API enabled.

For safe production use:

1. Create a Google Maps Platform browser key.
2. Restrict website access to `https://proccyboi.github.io/proccy-boi/*` and local development origins as needed.
3. Restrict API access to the Maps JavaScript API.
4. Paste the key into the setup panel for a tab-only session.

To configure a public browser key by default, set the empty `google-maps-api-key` meta tag in `projects/skylabs/flight-review/index.html`. Browser keys are visible to visitors by design, so origin and API restrictions are mandatory.

The Google view adds:

- the full flight path using absolute altitude;
- a terrain-clamped ground projection;
- start and end markers;
- a current-aircraft marker synchronized to the shared replay cursor;
- orbit, follow and top-down camera modes.

## Reference validation

The primary test fixture is `D:\Skylabs\Software\skylabs\data\F110211.BIN` (the linked reference flight is `F110211`, not `F11211`). Expected headline results are approximately:

- 13,772 usable visualizer samples;
- 679.33 seconds duration;
- 6.79 km GNSS ground track;
- 37.98 m/s peak ground speed;
- 123.11–260.38 m barometric altitude;
- 1.18 m median GNSS horizontal accuracy.

The raw file is not copied into the public repository.
