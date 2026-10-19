/* One deterministic backdrop pass. The aircraft controller owns rendering and
 * supplies landing/scroll state; this module has no clock, requests or RAF. */
(() => {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p); };

  function create(T, { detailed = false } = {}) {
    const scene = new T.Scene();
    scene.name = 'Skylabs atmosphere';
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uAspect: { value: 1.6 }, uMobile: { value: 0 }, uShort: { value: 0 },
      uDrift: { value: 0 }, uStrength: { value: 1 }, uPixel: { value: .001 }
    };
    const material = new T.ShaderMaterial({
      name: 'Finite atmospheric backdrop', uniforms,
      // Compile the extra environment out entirely for the unchanged v2 hero.
      defines: detailed ? { DETAILED_AIRFIELD: 1 } : {},
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
        uniform float uPixel;

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
        #ifdef DETAILED_AIRFIELD
        float shapeBox(vec2 p, vec2 halfSize, float aa) {
          vec2 d = abs(p) - halfSize;
          return 1.0 - smoothstep(-aa, aa, max(d.x, d.y));
        }
        // Low buildings stay small enough to read as a distant training field.
        // These are illustrative silhouettes, not a surveyed airport or site.
        vec3 hangar(vec3 colour, vec2 p, vec2 origin, vec2 size, float aa) {
          vec2 q = p - origin;
          float wall = shapeBox(q - vec2(0.0, size.y * .5), size * vec2(.5, .5), aa);
          float roofHeight = size.y + .22 * size.x * max(0.0, 1.0 - abs(q.x) / (size.x * .53));
          float roof = (1.0 - smoothstep(size.x * .51, size.x * .54, abs(q.x)))
                     * smoothstep(size.y - aa, size.y + aa, q.y)
                     * (1.0 - smoothstep(roofHeight - aa, roofHeight + aa, q.y));
          colour = mix(colour, vec3(.215, .258, .262), wall * .92);
          colour = mix(colour, vec3(.258, .294, .293), roof * .90);
          float door = shapeBox(q - vec2(0.0, size.y * .42), size * vec2(.32, .39), aa);
          float ribs = .5 + .5 * sin(q.x * 850.0);
          colour = mix(colour, vec3(.160, .199, .208) + ribs * .009, door * .80);
          return colour;
        }
        #endif
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
          #ifdef DETAILED_AIRFIELD
          // A broad, soft light source and high wisps enrich the open sky;
          // the existing copy-zone ceiling below still bounds every channel.
          float eveningLight = lobe(p, vec2(.70, horizon + .10), vec2(.75, .27));
          colour += vec3(.040, .030, .016) * eveningLight;
          float highWisp = noise(vec2(p.x * 3.8 - uDrift * .055 + 9.0, uv.y * 31.0));
          highWisp = smoothstep(.48, .78, highWisp) * smoothstep(.60, .75, uv.y)
                   * (1.0 - smoothstep(.84, .97, uv.y));
          colour += vec3(.025, .027, .026) * highWisp;
          #endif

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

          #ifdef DETAILED_AIRFIELD
          // Broad ridges, wooded foothills, then individual crowns. Their
          // unequal parallax is tied only to the finite landing/scroll pose.
          float ridgeX = p.x + uDrift * .008;
          float farRidge = horizon + .025 + noise(vec2(ridgeX * 2.4 + 18.0, 4.6)) * .046;
          farRidge += sin(ridgeX * 3.7 + 1.5) * .013;
          float ridgeMask = 1.0 - smoothstep(farRidge - .003, farRidge + .003, uv.y);
          colour = mix(colour, vec3(.278, .332, .340), ridgeMask * .78);
          float nearRidge = horizon + .003 + noise(vec2((p.x + uDrift * .013) * 5.0 + 7.0, 2.1)) * .027;
          float foothills = 1.0 - smoothstep(nearRidge - .002, nearRidge + .002, uv.y);
          colour = mix(colour, vec3(.184, .246, .253), foothills * .88);
          float treeX = (p.x + uDrift * .018) * 72.0;
          float treeSeed = hash(vec2(floor(treeX), 8.0));
          float treeRadius = mix(.34, .50, treeSeed);
          float treeLocal = (fract(treeX) - .5) / treeRadius;
          float crownProfile = sqrt(max(0.0, 1.0 - treeLocal * treeLocal));
          float grove = noise(vec2(p.x * 15.0 + 6.0, 3.0));
          float treeline = horizon - .009 + grove * .019
                         + crownProfile * (.0015 + treeSeed * treeSeed * .010);
          float trees = 1.0 - smoothstep(treeline - uPixel * .8, treeline + uPixel * .8, uv.y);
          colour = mix(colour, vec3(.122, .187, .192), trees * .91);
          // A narrow valley-haze band separates the silhouettes without
          // adding a hard horizontal horizon or a luminous skyline.
          float valleyHaze = exp(-pow((uv.y - horizon - .002) / .013, 2.0));
          colour = mix(colour, vec3(.294, .335, .338), valleyHaze * .13);
          #endif

          // A low-contrast airfield settles beneath the model. No fake runway
          // markings or locations: just distant terrain and a broad apron.
          float terrain = horizon - 0.017 + noise(vec2(p.x * 8.0 + 21.0, 4.0)) * 0.015;
          float ground = 1.0 - smoothstep(terrain - 0.009, terrain + 0.012, uv.y);
          vec3 groundColour = mix(page, vec3(0.17, 0.195, 0.19), smoothstep(0.0, horizon, uv.y));
          float apron = exp(-pow((p.x + 0.03) / max(0.04, 0.30 + (horizon - uv.y) * 2.2), 2.0));
          groundColour += vec3(0.018, 0.020, 0.019) * apron * smoothstep(0.0, horizon, uv.y);
          colour = mix(colour, groundColour, ground);

          #ifdef DETAILED_AIRFIELD
          // Restrict buildings and the windsock to the distant horizon.
          // Foreground markings belong to the real world-space floor below.
          float airfieldX = mix(.58, .09, uMobile) - uDrift * .006;
          vec2 airfieldPoint = vec2(p.x, uv.y);
          float buildingBase = horizon - .010;
          float silhouetteAA = max(.0007, uPixel * .75);
          colour = hangar(colour, airfieldPoint, vec2(airfieldX, buildingBase), vec2(.088, .019), silhouetteAA);
          colour = hangar(colour, airfieldPoint, vec2(airfieldX + .100, buildingBase + .001), vec2(.060, .014), silhouetteAA);
          vec2 sock = airfieldPoint - vec2(airfieldX - .093, buildingBase);
          float pole = shapeBox(sock - vec2(0.0, .019), vec2(.00065, .019), silhouetteAA);
          colour = mix(colour, vec3(.275, .309, .300), pole * .80);
          float sockT = clamp(sock.x / .020, 0.0, 1.0);
          float sockCentre = .035 - .006 * sockT;
          float sockWidth = mix(.0030, .0012, sockT);
          float fabric = smoothstep(-silhouetteAA, silhouetteAA, sock.x)
                       * (1.0 - smoothstep(.020 - silhouetteAA, .020 + silhouetteAA, sock.x))
                       * (1.0 - smoothstep(sockWidth - silhouetteAA, sockWidth + silhouetteAA, abs(sock.y - sockCentre)));
          vec3 sockColour = mix(vec3(.385, .285, .215), vec3(.47, .455, .393), step(.5, fract(sockT * 3.0)));
          colour = mix(colour, sockColour, fabric * .72);
          #endif

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
      uniforms.uPixel.value = 1 / h;
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
  // Optional detailed-v3 floor decoration. Call after the controller has
  // installed uSky and vGroundDepth; the original shadow receiver is untouched.
  // This is one existing floor draw, with no new textures, meshes or clock.
  function detailGround(shader) {
    if (!shader.uniforms.uSky || !shader.fragmentShader.includes('vGroundDepth') ||
        !shader.vertexShader.includes('#include <project_vertex>') ||
        !shader.fragmentShader.includes('#include <color_fragment>')) return false;
    if (shader.vertexShader.includes('varying vec3 vAirfieldPosition;')) return true;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAirfieldPosition;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvAirfieldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vAirfieldPosition;
        float airfieldHash(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * .1031);
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }
        float airfieldGrain(vec2 p) {
          vec2 cell = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(airfieldHash(cell), airfieldHash(cell + vec2(1.0, 0.0)), f.x),
                     mix(airfieldHash(cell + vec2(0.0, 1.0)), airfieldHash(cell + vec2(1.0)), f.x), f.y);
        }
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (uSky > 0.0) {
          // Metre-scaled texture follows the actual landing plane through the
          // approach and camera orbit; it can never slide over the airframe.
          vec2 field = vAirfieldPosition.xz;
          float detailFade = 1.0 - smoothstep(4.0, 11.0, vGroundDepth);
          float aa = .002 + max(0.0, vGroundDepth) * .0008;
          float verge = smoothstep(1.45, 1.60, abs(field.y));
          float grain = airfieldGrain(field * 65.0) - .5;
          float wear = airfieldGrain(field * vec2(.7, 6.0)) - .5;
          vec3 surface = diffuseColor.rgb * (1.0 + grain * .12 * detailFade + wear * .16);
          surface = mix(surface, surface * vec3(.86, 1.07, .84), verge * .55);
          surface *= 1.0 + verge * sin(field.x * 2.8 + .4) * .024;
          // Fine expansion joints, worn edge paint and quiet tyre paths are
          // ground cues, not prominent fabricated runway labels or numbers.
          vec2 jointDistance = abs(fract((field + vec2(.85, .40)) / vec2(3.7, 2.4)) - .5) * vec2(3.7, 2.4);
          float joint = 1.0 - smoothstep(.001, .002 + aa, min(jointDistance.x, jointDistance.y));
          surface *= 1.0 - joint * .09 * detailFade;
          float paint = 1.0 - smoothstep(.008, .012 + aa, abs(abs(field.y) - 1.25));
          paint *= (.53 + airfieldGrain(field * 4.0) * .47) * (1.0 - smoothstep(8.0, 11.0, abs(field.x)));
          surface = mix(surface, surface * 1.65 + vec3(.0060, .0059, .0045), paint * .34);
          float tyre = exp(-pow((abs(field.y) - .17) / .055, 2.0));
          surface *= 1.0 - tyre * .075 * detailFade;
          diffuseColor.rgb = mix(diffuseColor.rgb, surface, uSky);
        }
      `);
    return true;
  }
  window.V3AircraftAtmosphere = Object.freeze({ create, detailGround });
})();
