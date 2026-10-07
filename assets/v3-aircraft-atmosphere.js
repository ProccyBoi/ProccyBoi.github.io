/* One deterministic backdrop pass. The aircraft controller owns rendering and
 * supplies landing/scroll state; this module has no clock, requests or RAF. */
(() => {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p); };

  function create(T) {
    const scene = new T.Scene();
    scene.name = 'Skylabs atmosphere';
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uAspect: { value: 1.6 }, uMobile: { value: 0 }, uShort: { value: 0 },
      uDrift: { value: 0 }, uStrength: { value: 1 }
    };
    const material = new T.ShaderMaterial({
      name: 'Finite atmospheric backdrop', uniforms,
      depthTest: false, depthWrite: false, transparent: false,
      toneMapped: false, fog: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uAspect;
        uniform float uMobile;
        uniform float uShort;
        uniform float uDrift;
        uniform float uStrength;

        float hash(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * 0.1031);
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
          float value = 0.5333 * noise(p);
          p = turn * p * 2.03 + 7.1;
          value += 0.2667 * noise(p);
          p = turn * p * 2.01 + 3.7;
          value += 0.1333 * noise(p);
          p = turn * p * 2.02 + 9.2;
          return value + 0.0667 * noise(p);
        }
        float lobe(vec2 p, vec2 centre, vec2 radius) {
          vec2 d = (p - centre) / radius;
          return exp(-dot(d, d) * 2.0);
        }
        void main() {
          // These are display/sRGB values. Deliberately omit Three's output
          // encoding/tone-map chunks so the final state matches CSS exactly.
          vec3 page = vec3(16.0, 18.0, 16.0) / 255.0;
          if (uStrength <= 0.0) { gl_FragColor = vec4(page, 1.0); return; }
          vec2 uv = vUv;
          vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y);
          float horizon = mix(0.39, 0.38, uMobile);
          float skyHeight = smoothstep(horizon, 1.0, uv.y);
          vec3 colour = mix(vec3(0.32, 0.385, 0.42), vec3(0.080, 0.125, 0.155), skyHeight);
          float horizonLight = exp(-pow((uv.y - horizon - 0.028) / 0.11, 2.0));
          colour += vec3(0.105, 0.107, 0.10) * horizonLight;

          // A far, thin layer recedes into atmospheric haze. Domain motion is
          // a pure function of the existing finite landing and scroll poses.
          vec2 farPoint = vec2(p.x * 3.0 - uDrift * 0.25 + 4.0, uv.y * 15.0 + 8.0);
          float farNoise = fbm(farPoint);
          float farTop = horizon + 0.115 + (farNoise - 0.5) * 0.14;
          float farShape = smoothstep(horizon + 0.007, horizon + 0.050, uv.y)
                         * (1.0 - smoothstep(farTop - 0.025, farTop + 0.025, uv.y));
          vec3 farColour = mix(vec3(0.255, 0.315, 0.35), vec3(0.49, 0.54, 0.56), smoothstep(0.30, 0.78, farNoise));
          colour = mix(colour, farColour, farShape * 0.64);

          // Unequal overlapping puffs give the near bank a broken, rising
          // silhouette. Max-union retains separate crowns rather than turning
          // their summed density into one long blurred capsule.
          // The phone layout compresses span and brings the bank into the
          // open strip between the copy and the aircraft, around x=.07.
          vec2 cloudPoint = vec2(p.x / mix(1.0, 0.48, uMobile)
                              + uMobile * 0.35 - uDrift * 0.040,
                              uv.y + uMobile * 0.060);
          float bank = max(lobe(cloudPoint, vec2(0.20, 0.600), vec2(0.19, 0.060)) * 0.80,
                           lobe(cloudPoint, vec2(0.33, 0.648), vec2(0.14, 0.090)));
          bank = max(bank, lobe(cloudPoint, vec2(0.48, 0.616), vec2(0.18, 0.065)) * 0.95);
          bank = max(bank, lobe(cloudPoint, vec2(0.60, 0.677), vec2(0.16, 0.097)));
          bank = max(bank, lobe(cloudPoint, vec2(0.76, 0.624), vec2(0.17, 0.065)) * 0.88);
          bank = max(bank, lobe(cloudPoint, vec2(0.91, 0.650), vec2(0.11, 0.064)) * 0.76);
          // A second, lower broken bank reads at a different depth and scale.
          bank = max(bank, lobe(cloudPoint, vec2(-0.15, 0.545), vec2(0.18, 0.033)) * 0.50);
          bank = max(bank, lobe(cloudPoint, vec2(-0.39, 0.555), vec2(0.12, 0.046)) * 0.63);
          vec2 texturePoint = cloudPoint * vec2(13.0, 22.0) + vec2(11.2, 2.6);
          float detail = fbm(texturePoint);
          float fine = noise(texturePoint * 3.7 + 12.3);
          float body = bank - 0.225 + (detail - 0.5) * 0.34 + (fine - 0.5) * 0.075;
          float cloud = smoothstep(-0.030, 0.065, body);
          float upper = noise(texturePoint + vec2(-0.35, 0.70));
          float crown = smoothstep(0.585, 0.690, cloudPoint.y);
          float light = clamp(0.20 + detail * 0.62 + crown * 0.20 + (upper - detail) * 0.65, 0.0, 1.0);
          vec3 cloudColour = mix(vec3(0.215, 0.28, 0.325), vec3(0.66, 0.69, 0.70), light);
          float softRim = exp(-abs(body - 0.025) * 26.0) * crown;
          cloudColour += vec3(0.075, 0.070, 0.058) * softRim;
          colour = mix(colour, cloudColour, cloud * 0.90);

          // A low-contrast airfield settles beneath the model. No fake runway
          // markings or locations: just distant terrain and a broad apron.
          float terrain = horizon - 0.017 + noise(vec2(p.x * 8.0 + 21.0, 4.0)) * 0.015;
          float ground = 1.0 - smoothstep(terrain - 0.009, terrain + 0.012, uv.y);
          vec3 groundColour = mix(page, vec3(0.17, 0.195, 0.19), smoothstep(0.0, horizon, uv.y));
          float apron = exp(-pow((p.x + 0.03) / max(0.04, 0.30 + (horizon - uv.y) * 2.2), 2.0));
          groundColour += vec3(0.018, 0.020, 0.019) * apron * smoothstep(0.0, horizon, uv.y);
          colour = mix(colour, groundColour, ground);

          // The title occupies the upper left on desktop and the upper half
          // on phones. Keep those regions quiet without hiding the horizon.
          float desktopCopy = (1.0 - smoothstep(0.24, 0.66, uv.x)) * smoothstep(0.48, 0.75, uv.y);
          float phoneCopy = smoothstep(0.43, 0.79, uv.y);
          float copyShade = mix(desktopCopy * 0.78, phoneCopy * 0.82, uMobile);
          colour = mix(colour, page, copyShade);
          float desktopSafe = (1.0 - smoothstep(0.42, 0.62, uv.x))
                            * smoothstep(mix(0.45, 0.30, uShort), mix(0.60, 0.42, uShort), uv.y);
          float phoneSafe = smoothstep(0.45, 0.57, uv.y);
          float safeZone = mix(desktopSafe, phoneSafe, uMobile);
          // A display-channel ceiling of .24 bounds text-zone relative
          // luminance below .047, keeping the existing muted body copy clear.
          vec3 copySafe = colour * min(1.0, 0.24 / max(0.001, max(colour.r, max(colour.g, colour.b))));
          colour = mix(colour, copySafe, safeZone);
          float edge = pow(abs(uv.x - 0.5) * 2.0, 3.0) * 0.12;
          colour *= 1.0 - edge;
          colour = mix(page, colour, smoothstep(0.0, 0.14, uv.y));
          gl_FragColor = vec4(mix(page, colour, uStrength), 1.0);
        }
      `
    });
    const geometry = new T.PlaneGeometry(2, 2);
    const quad = new T.Mesh(geometry, material);
    quad.name = 'Atmospheric backdrop'; quad.frustumCulled = false;
    scene.add(quad);
    let opacity = 1, disposed = false;
    function update({ landing = 1, progress = 0, width = 1600, height = 1000, strength = 1 } = {}) {
      const l = clamp(finite(landing, 1)), p = clamp(finite(progress, 0));
      const w = Math.max(1, finite(width, 1600)), h = Math.max(1, finite(height, 1000));
      opacity = (1 - smooth((p - .06) / .32)) * clamp(finite(strength, 1));
      uniforms.uStrength.value = opacity;
      uniforms.uAspect.value = Math.max(.25, Math.min(4, w / h));
      uniforms.uMobile.value = w <= 760 ? 1 : 0;
      // Copy keeps its physical font sizes in a short desktop viewport, so
      // its final lines occupy a lower fraction of the canvas than usual.
      uniforms.uShort.value = w > 760 && h < 720 ? 1 : 0;
      uniforms.uDrift.value = smooth(l) * .75 + smooth(p) * .18;
      return opacity;
    }
    update();
    return {
      scene, camera, update,
      get opacity() { return opacity; },
      dispose() { if (!disposed) { geometry.dispose(); material.dispose(); disposed = true; } }
    };
  }
  window.V3AircraftAtmosphere = Object.freeze({ create });
})();
