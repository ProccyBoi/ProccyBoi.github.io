# V2 case-study evidence audit

Audited 11 October 2026. Website baseline: `d725a378806eb05c8d5b981f8e54d33dde502cac`.
Content records: `scripts/content/v2-case-evidence.json`.

## Evidence rules

The records distinguish designed hardware, manufactured assemblies, published software, test code and measured results. A photograph establishes the object shown; it does not establish electrical compliance or performance. A CAD viewer establishes design geometry, not a manufactured assembly. Test source establishes coverage, not a passing run or a bench measurement.

Only existing public website material and verified public project repositories were used. No new research results or employer-confidential design material are introduced. The JSON deliberately omits unsupported sections; the renderer should omit their headings too. `media_label` can be used alongside an image/viewer so visitors can distinguish photographs from CAD.

`links` contains visitor-facing evidence links; `sources` pins the audit evidence. String fields are plain text, `decisions` is a list of paragraphs, and other sections are optional. The optional `challenges` field is present only where a specific published failure and response exist.

## Framework ESP32 Card

- Source: [baseline page](https://github.com/ProccyBoi/ProccyBoi.github.io/blob/d725a378806eb05c8d5b981f8e54d33dde502cac/v2/projects/framework-expansion-card/index.html#L76-L129).
- Problem/decisions: the page identifies the bay outline, 0.6 mm thickness, direct USB-C mating, antenna keep-out, CH340K, BC817 pair and AMS1117-3.3.
- Maturity/validation/outcome: the published black-revision photograph was visually inspected. It shows a populated board in the clear shell. Earlier-green-revision photographs support the revision comparison.
- No specific public project schematic or firmware repository was located. Use build and CAD links without labelling either as schematic/source.
- Unsupported: radio performance comparison, connector-cycle reliability, thermal or current measurements, or a particular debugging incident.

## Dual USB-C Framework Card

- Source: [baseline page](https://github.com/ProccyBoi/ProccyBoi.github.io/blob/d725a378806eb05c8d5b981f8e54d33dde502cac/v2/projects/framework-dual-usb/index.html#L40-L64).
- Problem/decisions: the existing prose explicitly justifies USB 2.0 for small peripherals and outlines routing/power constraints; it names the CH334F, TPS2065 and USBLC6-2SC6.
- Maturity/validation/outcome: the installed-card photograph was visually inspected. It supports physical installation and two downstream connectors; populated-board photographs show the build.
- Unsupported: measured throughput, USB compliance, current-limit measurements, ESD qualification or an unrecorded failure-and-fix story.

## RP2354B Framework Card

- Source: [baseline page](https://github.com/ProccyBoi/ProccyBoi.github.io/blob/d725a378806eb05c8d5b981f8e54d33dde502cac/v2/projects/framework-raspberry-pi/index.html#L40-L62).
- Problem/decisions: the published layout gives 26 × 30 mm, 0.8 mm, a straddle-mount USB-C plug, mounting points, controller, flash, crystal, power circuit and two tactile controls.
- Maturity/outcome: the published image was visually inspected and is a CAD render. Use `PCB design`; do not call the reference-enclosure rendering a fit test.
- `validation` is intentionally absent. No manufacturing, firmware behaviour, electrical testing or measured assembly fit is established by this evidence.

## Framework Logic Analyser

Public repository verified: [framework-logic-analyser-firmware](https://github.com/ProccyBoi/framework-logic-analyser-firmware), commit `4f7fab28231c551710e99b5fefebfb3a0a6669cf`.

- [README](https://github.com/ProccyBoi/framework-logic-analyser-firmware/blob/4f7fab28231c551710e99b5fefebfb3a0a6669cf/README.md): capture modes, USB CDC, VCD/CSV tooling, configured rate/buffer limits and missing hardware trigger/pre-trigger support.
- [Hardware mapping](https://github.com/ProccyBoi/framework-logic-analyser-firmware/blob/4f7fab28231c551710e99b5fefebfb3a0a6669cf/docs/HARDWARE.md): routed nets, safe boot and route sequencing, raw GPIO voltage limits and explicit rationale for excluding passive RS-232.
- [Capture implementation](https://github.com/ProccyBoi/framework-logic-analyser-firmware/blob/4f7fab28231c551710e99b5fefebfb3a0a6669cf/src/capture.cpp): timer-triggered DMA, mode routing, limits and cleanup.
- [Host tests](https://github.com/ProccyBoi/framework-logic-analyser-firmware/blob/4f7fab28231c551710e99b5fefebfb3a0a6669cf/tests/test_host.py): simulated serial framing, VCD/CSV export, mode parsing and duration validation.
- [Website baseline](https://github.com/ProccyBoi/ProccyBoi.github.io/blob/d725a378806eb05c8d5b981f8e54d33dde502cac/v2/projects/framework-logic-analyser/index.html): PCB dimensions and CAD. The poster was visually inspected as a render.
- Maturity is `PCB design + prototype firmware`. The 10 MS/s value is a configured software ceiling, not a measured capture result. The hardware-map document is not a downloadable schematic. No passed hardware tests or fabricated card are inferred.

## TramTrace

Public repository verified: [TramTrace](https://github.com/ProccyBoi/TramTrace), commit `0afb61a89a005fbba85201744a3132d2a5170ee3`.

- [Website baseline](https://github.com/ProccyBoi/ProccyBoi.github.io/blob/d725a378806eb05c8d5b981f8e54d33dde502cac/v2/projects/tramtrace/index.html): individual work is described as PCB design, embedded display logic and vehicle-position service. The illuminated hardware photograph was visually inspected.
- [README](https://github.com/ProccyBoi/TramTrace/blob/0afb61a89a005fbba85201744a3132d2a5170ee3/README.md): firmware/service architecture, brightness cap, pixel test sequence, data freshness, 60-second frame expiry and direction acceptance procedure.
- [Hardware mapping](https://github.com/ProccyBoi/TramTrace/blob/0afb61a89a005fbba85201744a3132d2a5170ee3/hardware/README.md): five chains, level shifting, 116 pixels, shared L2/L3 section and single-pixel L1 Central exception.
- [Mapping tests](https://github.com/ProccyBoi/TramTrace/blob/0afb61a89a005fbba85201744a3132d2a5170ee3/tests/hardware/test_station_mapping.py): 68 route/station entries, CSV/firmware agreement, coverage and layout exceptions.
- The destination-to-adjacent-pixel convention still requires the documented visual `test-pairs` acceptance check. Do not represent schematic-derived chain order as proof that this visual direction check passed.
- Do not infer electrical current measurements from theoretical LED-current calculations. No uptime/latency benchmark or test pass is asserted here.

## Metroboard

Public repository verified: [Metroboard](https://github.com/ProccyBoi/Metroboard), commit `b3f949929456845b8da3e8ad2c9915beee199b7f`.

- [Website baseline](https://github.com/ProccyBoi/ProccyBoi.github.io/blob/d725a378806eb05c8d5b981f8e54d33dde502cac/v2/projects/metroboard/index.html): 300 × 305.7 mm, 291 pixels, PCB-as-map architecture, service contribution and the later TramTrace relationship. The illuminated photograph was visually inspected.
- [README](https://github.com/ProccyBoi/Metroboard/blob/b3f949929456845b8da3e8ad2c9915beee199b7f/README.md): GTFS station/route keys, LED-state conversion, feed caching/backoff/expiry and the firmware source entrypoint.
- [Feed-cache tests](https://github.com/ProccyBoi/Metroboard/blob/b3f949929456845b8da3e8ad2c9915beee199b7f/tests/test_feed_cache.py): source-level evidence of failure-path coverage, not a measured field-reliability result.
- The separate public `Sydney-Metroboard` repository contains a quickstart/older sketch. Prefer the `Metroboard` repository's documented current service and firmware entrypoint for the portfolio link.

## RF Test Board

- [RF baseline](https://github.com/ProccyBoi/ProccyBoi.github.io/blob/d725a378806eb05c8d5b981f8e54d33dde502cac/v2/projects/rf-test-board/index.html#L49-L58) and [preceding LoRa case](https://github.com/ProccyBoi/ProccyBoi.github.io/blob/d725a378806eb05c8d5b981f8e54d33dde502cac/v2/projects/lora-receiver/index.html) support the failure-to-test-coupon narrative.
- The record supports fabrication without impedance control, VNA investigation, masked/unmasked coplanar structures, u.FL/SMA transitions, filter footprints and printed nominal dimensions.
- `50 Ω` remains a design target. No measured impedance, S-parameter plot, test-fixture calibration or numeric improvement is available to add.

## Switchmode Power Supplies

- [About baseline](https://github.com/ProccyBoi/ProccyBoi.github.io/blob/d725a378806eb05c8d5b981f8e54d33dde502cac/v2/about/index.html#L56-L60) supports trainee role, dates and maintaining/testing/repairing low- and high-voltage supplies.
- [Project baseline](https://github.com/ProccyBoi/ProccyBoi.github.io/blob/d725a378806eb05c8d5b981f8e54d33dde502cac/v2/projects/switch-mode-power-supplies/index.html) supports the two named boards. The component-side photo of the V03 board was visually inspected as manufactured/assembled hardware.
- No evidence here assigns the user sole design ownership of these employer boards. Keep the role precise, and omit problem/decisions/outcome rather than invent design intent or measurements.
- Suitable homepage copy: “Power-supply testing and repair. Electronics Engineer Trainee at Switchmode Power Supplies, with published photographs of two isolated glitch-tester boards.” Link the existing case. This adds professional testing range; it does not fulfil a new converter/thesis case study with losses and simulation results.

## Skylabs aircraft telemetry

- [Telemetry baseline](https://github.com/ProccyBoi/ProccyBoi.github.io/blob/d725a378806eb05c8d5b981f8e54d33dde502cac/v2/projects/skylabs/boards/telemetry/index.html) supports the board role, sensor presence/validity, NaN representation and logging architecture.
- [Public flight diagnostic](https://github.com/ProccyBoi/ProccyBoi.github.io/blob/d725a378806eb05c8d5b981f8e54d33dde502cac/shared/projects/skylabs/f110211/diagnostic.md) is the direct source for all measured outcomes, failures and subsequent changes. Visitor link: [rendered diagnostic](https://proccyboi.github.io/shared/projects/skylabs/f110211/diagnostic.html).
- Flight: 13,773 recoverable records, 13,772 usable for replay, 679.331 s, actual average 20.27 Hz, 50 ms median interval, 40 Hz configured target, 13,402 overruns and zero SD write errors.
- Real failure: navigation EKF divergence. The public diagnostic excludes that EKF path and prefers valid raw GNSS horizontal position and barometric height.
- Post-flight changes: groups of eight records per SD write; sensor acquisition/logging ahead of radio service; mounting-frame corrections; estimator validity and plausibility gates.
- Bench follow-up: 150-second hold, 146/146 fresh samples, continuous BNO/BME validity. This does not establish revised SD rate or EKF recovery: the diagnostic explicitly requires a fresh aircraft binary log to validate those.
- Keep the existing replay's GPS-route disclosure. Do not copy detailed route coordinates into new promotional text.
- Hero/spec labels should say `40 Hz target`, with `20.27 Hz in reference flight` in the evidence section. Do not claim that the flight demonstrated sustained 40 Hz.

## Homepage curation recommendation

Keep the existing visual identity and lead with direct links to four complementary contributions: Skylabs (measured avionics/logging), one Framework card (compact embedded hardware), RF Test Board (measurement-led iteration), and Switchmode (professional power-supply testing/repair). Transport-display work remains valuable and should be directly browsable. A new power-converter or thesis case needs a publishable source and the user's exact contribution before adding simulations, loss analysis, trade-offs or results.
