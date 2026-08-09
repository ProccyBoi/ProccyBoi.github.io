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

## Open 3D terrain

The primary map replay is keyless and uses an open geospatial stack:

- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) 5.24.0, vendored with the site, renders the terrain and synchronized overlays.
- [OpenFreeMap](https://openfreemap.org/) supplies the Liberty vector basemap using OpenStreetMap data, including 3D building extrusion where height data exists.
- [Mapterhorn](https://mapterhorn.com/) supplies the public elevation tiles used by MapLibre's terrain mesh and hillshade.
- the existing Three.js runtime draws the absolute-altitude airborne path, aircraft attitude model and vertical position tether in MapLibre's shared 3D scene.

No account, API key or billing configuration is required. The uploaded flight file still remains in browser memory; only normal basemap and elevation-tile requests leave the device. Provider and OpenStreetMap attribution remain visible in the map.

The terrain view includes:

- the airborne flight path at the selected barometric or GNSS altitude;
- a terrain-clamped, distance-gradient ground projection;
- open-map labels and 3D buildings;
- start, end and synchronized current-aircraft markers;
- orbit, follow and top-down camera modes;
- selectable 1×, 2× and 5× vertical exaggeration.

## Reference validation

The primary test fixture is `D:\Skylabs\Software\skylabs\data\F110211.BIN` (the linked reference flight is `F110211`, not `F11211`). Expected headline results are approximately:

- 13,772 usable visualizer samples;
- 679.33 seconds duration;
- 6.79 km GNSS ground track;
- 37.98 m/s peak ground speed;
- 123.11–260.38 m barometric altitude;
- 1.18 m median GNSS horizontal accuracy.

The raw file is not copied into the public repository.
