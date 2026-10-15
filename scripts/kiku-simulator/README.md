# Kiku display simulator

The browser runs the **unmodified production C display renderer** as a small
freestanding WebAssembly module. The checked-in snapshot includes the renderer,
its owned header dependencies and the FM text-validity implementation. File hashes
and original firmware-relative paths are recorded in `provenance.json`.

`bridge.c` supplies a deterministic browser input model and illustrative tracks,
radio stations, battery readings and phone connection events. It captures the
renderer’s ST7789 RGB565 writes into a 320 × 240 framebuffer. It does **not** run
the STM32 application, RTOS, audio decoders, radio or power hardware. It generates
no audio and requests no browser Bluetooth/device permissions. Hold duration,
power transitions, seek latency and the hidden Home theme-tap timeout are omitted.
The production Library screen is not reachable from current controls, so the demo
does not invent a path to it. Output selection applies on rotation, as on firmware.

Build with LLVM clang + wasm-ld (no WASI/sysroot or third-party runtime required):

```sh
python scripts/kiku-simulator/build.py
node scripts/kiku-simulator/verify.cjs
```

An explicit refresh preserves exact owned sources and records new hashes:

```sh
python scripts/kiku-simulator/build.py --refresh-from /path/to/project/Firmware
```

The small `libc.c` supports only the string and formatting functions used by this
snapshot. `build.py` verifies the frozen hashes before compiling. The binary is
published at `/assets/kiku/firmware-ui.wasm`; the browser adapter is the ES module
`/assets/kiku-simulator.js`.

Mount with:

```js
import {mountKikuSimulator} from '/assets/kiku-simulator.js';
await mountKikuSimulator(document.querySelector('[data-kiku-simulator]'));
```

The mount owns its descendants. Page styles can target `.kiku-sim`,
`.kiku-sim-toolbar`, `.kiku-sim-field`, `.kiku-sim-look`, `.kiku-sim-display`,
`.kiku-sim-canvas`, `.kiku-sim-controls`, `.kiku-sim-side`, `.kiku-sim-encoder`,
`.kiku-sim-turn`, `.kiku-sim-button`, `.kiku-sim-hold`, `.kiku-sim-state`,
`.kiku-sim-hint`, `.kiku-sim-notice`, `.kiku-sim-keyboard` and `.kiku-sim-note`.
Keep the canvas at a 4:3 ratio with `image-rendering: pixelated`, preserve visible
keyboard focus and use large touch targets. A live text description mirrors the
canvas for screen readers. Keyboard input is scoped to the focused display.

Each mount gets independent WebAssembly memory; the compiled module is reused.
The controller returns `reset()` and `destroy()`. No persistent browser data is
written. Native Node verification checks renderer output and control behavior;
browser visual/accessibility inspection is performed through CUA separately.
