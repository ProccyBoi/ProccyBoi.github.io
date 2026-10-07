# Aircraft atmosphere

`assets/v3-aircraft-atmosphere.js` supplies a background scene for the existing aircraft renderer. It adds one draw call and two triangles, with no textures, media downloads, dependencies, timers or animation loop. Two cloud layers use bounded four-octave value noise, softly shaded cloud-bank silhouettes, horizon haze and a restrained ground gradient. There is no ray marching.

```js
const atmosphere = V3AircraftAtmosphere.create(THREE);
renderer.autoClear = false;

// Inside the existing, finite aircraft render loop:
atmosphere.update({ landing: pose.landing, progress: pose.progress, width, height });
renderer.clear();
renderer.render(atmosphere.scene, atmosphere.camera);
renderer.clearDepth();
renderer.render(scene, camera);
```

`update` returns the atmosphere strength, also exposed by the read-only `opacity` getter. The background is fully present through scroll progress 0.06, fades with smoothstep, and is exactly the page colour `#101210` at progress 0.38 and beyond. An optional `strength` multiplier in `[0,1]` lets the controller reduce the effect. Landing and scroll progress determine drift directly; repeated or reverse seeks produce identical states. There is no wall-clock time input.

The shader writes display/sRGB colour directly and has `toneMapped: false`; it deliberately omits Three's output-encoding and tone-mapping chunks. This keeps its final colour equal to the CSS background under the existing product renderer. The shader exits before evaluating noise once strength reaches zero. The current output covers the whole viewport with alpha 1, so render it before the aircraft and clear depth between scenes. Any opaque 3D floor must be faded or otherwise limited by the parent scene to expose the horizon.

Desktop copy receives a quiet upper-left region; on phones the upper portion is darker across the full width. Inside the text-safe zones, display RGB channels are capped at 0.24, bounding relative luminance below 0.047 for the existing muted body copy. These zones cover X ≤ 0.42 and Y ≥ 0.60 on desktop, and Y ≥ 0.57 across the phone width, with soft transitions outside (Y is measured from the bottom). When the desktop stage is shorter than 720 pixels, the full left-side cap extends down to Y = 0.42 because the same physical text sizes occupy more of the canvas. Normal-height desktop and phone thresholds remain unchanged. The broad cloud forms remain in the middle-distance background so the white covering and blue control surfaces remain the focal point. The backdrop does not alter CAD materials, source meshes, lights, shadows or model delivery.

Call `dispose()` when permanently disposing the aircraft renderer. Repeated disposal is safe. The controller retains responsibility for reduced-motion/Save Data fallbacks, context restoration, visibility suspension, poster capture and scheduling.
