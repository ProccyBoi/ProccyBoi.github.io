/* WGSL/TSL port of the accepted finite airfield. No ShaderMaterial or GLSL rewriting. */
import * as T from './vendor/three-0.186.1/three.webgpu.js';
import { wgslFn, uniform, uv, vec4, vec3, positionLocal, positionView, positionWorld, mix, smoothstep, float, sRGBTransferEOTF } from './vendor/three-0.186.1/three.tsl.js';
const sky = wgslFn(`fn sky(vUv: vec2f, uAspect: f32, uMobile: f32, uShort: f32, uDrift: f32, uStrength: f32, uPixel: f32) -> vec3f {
          // These are display/sRGB values. Deliberately omit Three's output
          // encoding/tone-map chunks so the final state matches CSS exactly.
          var page: vec3f = vec3f(16.0, 18.0, 16.0) / 255.0;
          if (uStrength <= 0.0) { return page; }
          var uv: vec2f = vUv;
          var p: vec2f = vec2f((uv.x - 0.5) * uAspect, uv.y);
          var horizon: f32 = mix(0.39, 0.38, uMobile);
          var skyHeight: f32 = smoothstep(horizon, 1.0, uv.y);
          var colour: vec3f = mix(vec3f(0.32, 0.385, 0.42), vec3f(0.080, 0.125, 0.155), skyHeight);
          var horizonLight: f32 = exp(-pow((uv.y - horizon - 0.028) / 0.11, 2.0));
          colour += vec3f(0.105, 0.107, 0.10) * horizonLight;
          // A broad, soft light source and high wisps enrich the open sky;
          // the existing copy-zone ceiling below still bounds every channel.
          var eveningLight: f32 = lobe(p, vec2f(0.70, horizon + 0.10), vec2f(0.75, 0.27));
          colour += vec3f(0.040, 0.030, 0.016) * eveningLight;
          var highWisp: f32 = noise(vec2f(p.x * 3.8 - uDrift * 0.055 + 9.0, uv.y * 31.0));
          highWisp = smoothstep(0.48, 0.78, highWisp) * smoothstep(0.60, 0.75, uv.y)
                   * (1.0 - smoothstep(0.84, 0.97, uv.y));
          colour += vec3f(0.025, 0.027, 0.026) * highWisp;

          // A far, thin layer recedes into atmospheric haze. Domain motion is
          // a pure function of the existing finite landing and scroll poses.
          var farPoint: vec2f = vec2f(p.x * 3.0 - uDrift * 0.25 + 4.0, uv.y * 15.0 + 8.0);
          var farNoise: f32 = fbm(farPoint);
          var farTop: f32 = horizon + 0.115 + (farNoise - 0.5) * 0.14;
          var farShape: f32 = smoothstep(horizon + 0.007, horizon + 0.050, uv.y)
                         * (1.0 - smoothstep(farTop - 0.025, farTop + 0.025, uv.y));
          var farColour: vec3f = mix(vec3f(0.255, 0.315, 0.35), vec3f(0.49, 0.54, 0.56), smoothstep(0.30, 0.78, farNoise));
          colour = mix(colour, farColour, farShape * 0.64);

          // Unequal overlapping puffs give the near bank a broken, rising
          // silhouette. Max-union retains separate crowns rather than turning
          // their summed density into one long blurred capsule.
          // The phone layout compresses span and brings the bank into the
          // open strip between the copy and the aircraft, around x=0.07.
          var cloudPoint: vec2f = vec2f(p.x / mix(1.0, 0.48, uMobile)
                              + uMobile * 0.35 - uDrift * 0.040,
                              uv.y + uMobile * 0.060);
          var bank: f32 = max(lobe(cloudPoint, vec2f(0.20, 0.600), vec2f(0.19, 0.060)) * 0.80,
                           lobe(cloudPoint, vec2f(0.33, 0.648), vec2f(0.14, 0.090)));
          bank = max(bank, lobe(cloudPoint, vec2f(0.48, 0.616), vec2f(0.18, 0.065)) * 0.95);
          bank = max(bank, lobe(cloudPoint, vec2f(0.60, 0.677), vec2f(0.16, 0.097)));
          bank = max(bank, lobe(cloudPoint, vec2f(0.76, 0.624), vec2f(0.17, 0.065)) * 0.88);
          bank = max(bank, lobe(cloudPoint, vec2f(0.91, 0.650), vec2f(0.11, 0.064)) * 0.76);
          // A second, lower broken bank reads at a different depth and scale.
          bank = max(bank, lobe(cloudPoint, vec2f(-0.15, 0.545), vec2f(0.18, 0.033)) * 0.50);
          bank = max(bank, lobe(cloudPoint, vec2f(-0.39, 0.555), vec2f(0.12, 0.046)) * 0.63);
          var texturePoint: vec2f = cloudPoint * vec2f(13.0, 22.0) + vec2f(11.2, 2.6);
          var detail: f32 = fbm(texturePoint);
          var fine: f32 = noise(texturePoint * 3.7 + vec2f(12.3));
          var body: f32 = bank - 0.225 + (detail - 0.5) * 0.34 + (fine - 0.5) * 0.075;
          var cloud: f32 = smoothstep(-0.030, 0.065, body);
          var upper: f32 = noise(texturePoint + vec2f(-0.35, 0.70));
          var crown: f32 = smoothstep(0.585, 0.690, cloudPoint.y);
          var light: f32 = clamp(0.20 + detail * 0.62 + crown * 0.20 + (upper - detail) * 0.65, 0.0, 1.0);
          var cloudColour: vec3f = mix(vec3f(0.215, 0.28, 0.325), vec3f(0.66, 0.69, 0.70), light);
          var softRim: f32 = exp(-abs(body - 0.025) * 26.0) * crown;
          cloudColour += vec3f(0.075, 0.070, 0.058) * softRim;
          colour = mix(colour, cloudColour, cloud * 0.90);
          // Broad ridges, wooded foothills, then individual crowns. Their
          // unequal parallax is tied only to the finite landing/scroll pose.
          var ridgeX: f32 = p.x + uDrift * 0.008;
          var farRidge: f32 = horizon + 0.025 + noise(vec2f(ridgeX * 2.4 + 18.0, 4.6)) * 0.046;
          farRidge += sin(ridgeX * 3.7 + 1.5) * 0.013;
          var ridgeMask: f32 = 1.0 - smoothstep(farRidge - 0.003, farRidge + 0.003, uv.y);
          colour = mix(colour, vec3f(0.278, 0.332, 0.340), ridgeMask * 0.78);
          var nearRidge: f32 = horizon + 0.003 + noise(vec2f((p.x + uDrift * 0.013) * 5.0 + 7.0, 2.1)) * 0.027;
          var foothills: f32 = 1.0 - smoothstep(nearRidge - 0.002, nearRidge + 0.002, uv.y);
          colour = mix(colour, vec3f(0.184, 0.246, 0.253), foothills * 0.88);
          var treeX: f32 = (p.x + uDrift * 0.018) * 72.0;
          var treeSeed: f32 = hash(vec2f(floor(treeX), 8.0));
          var treeRadius: f32 = mix(0.34, 0.50, treeSeed);
          var treeLocal: f32 = (fract(treeX) - 0.5) / treeRadius;
          var crownProfile: f32 = sqrt(max(0.0, 1.0 - treeLocal * treeLocal));
          var grove: f32 = noise(vec2f(p.x * 15.0 + 6.0, 3.0));
          var treeline: f32 = horizon - 0.009 + grove * 0.019
                         + crownProfile * (0.0015 + treeSeed * treeSeed * 0.010);
          var trees: f32 = 1.0 - smoothstep(treeline - uPixel * 0.8, treeline + uPixel * 0.8, uv.y);
          colour = mix(colour, vec3f(0.122, 0.187, 0.192), trees * 0.91);
          // A narrow valley-haze band separates the silhouettes without
          // adding a hard horizontal horizon or a luminous skyline.
          var valleyHaze: f32 = exp(-pow((uv.y - horizon - 0.002) / 0.013, 2.0));
          colour = mix(colour, vec3f(0.294, 0.335, 0.338), valleyHaze * 0.13);

          // A low-contrast airfield settles beneath the model. No fake runway
          // markings or locations: just distant terrain and a broad apron.
          var terrain: f32 = horizon - 0.017 + noise(vec2f(p.x * 8.0 + 21.0, 4.0)) * 0.015;
          var ground: f32 = 1.0 - smoothstep(terrain - 0.009, terrain + 0.012, uv.y);
          var groundColour: vec3f = mix(page, vec3f(0.17, 0.195, 0.19), smoothstep(0.0, horizon, uv.y));
          var apron: f32 = exp(-pow((p.x + 0.03) / max(0.04, 0.30 + (horizon - uv.y) * 2.2), 2.0));
          groundColour += vec3f(0.018, 0.020, 0.019) * apron * smoothstep(0.0, horizon, uv.y);
          colour = mix(colour, groundColour, ground);
          // Restrict buildings and the windsock to the distant horizon.
          // Foreground markings belong to the real world-space floor below.
          var airfieldX: f32 = mix(0.58, 0.09, uMobile) - uDrift * 0.006;
          var airfieldPoint: vec2f = vec2f(p.x, uv.y);
          var buildingBase: f32 = horizon - 0.010;
          var silhouetteAA: f32 = max(0.0007, uPixel * 0.75);
          colour = hangar(colour, airfieldPoint, vec2f(airfieldX, buildingBase), vec2f(0.088, 0.019), silhouetteAA);
          colour = hangar(colour, airfieldPoint, vec2f(airfieldX + 0.100, buildingBase + 0.001), vec2f(0.060, 0.014), silhouetteAA);
          var sock: vec2f = airfieldPoint - vec2f(airfieldX - 0.093, buildingBase);
          var pole: f32 = shapeBox(sock - vec2f(0.0, 0.019), vec2f(0.00065, 0.019), silhouetteAA);
          colour = mix(colour, vec3f(0.275, 0.309, 0.300), pole * 0.80);
          var sockT: f32 = clamp(sock.x / 0.020, 0.0, 1.0);
          var sockCentre: f32 = 0.035 - 0.006 * sockT;
          var sockWidth: f32 = mix(0.0030, 0.0012, sockT);
          var fabric: f32 = smoothstep(-silhouetteAA, silhouetteAA, sock.x)
                       * (1.0 - smoothstep(0.020 - silhouetteAA, 0.020 + silhouetteAA, sock.x))
                       * (1.0 - smoothstep(sockWidth - silhouetteAA, sockWidth + silhouetteAA, abs(sock.y - sockCentre)));
          var sockColour: vec3f = mix(vec3f(0.385, 0.285, 0.215), vec3f(0.47, 0.455, 0.393), step(0.5, fract(sockT * 3.0)));
          colour = mix(colour, sockColour, fabric * 0.72);

          // The title occupies the upper left on desktop and the upper half
          // on phones. Keep those regions quiet without hiding the horizon.
          var desktopCopy: f32 = (1.0 - smoothstep(0.24, 0.66, uv.x)) * smoothstep(0.48, 0.75, uv.y);
          var phoneCopy: f32 = smoothstep(0.43, 0.79, uv.y);
          var copyShade: f32 = mix(desktopCopy * 0.78, phoneCopy * 0.82, uMobile);
          colour = mix(colour, page, copyShade);
          var desktopSafe: f32 = (1.0 - smoothstep(0.42, 0.62, uv.x))
                            * smoothstep(mix(0.45, 0.30, uShort), mix(0.60, 0.42, uShort), uv.y);
          var phoneSafe: f32 = smoothstep(0.45, 0.57, uv.y);
          var safeZone: f32 = mix(desktopSafe, phoneSafe, uMobile);
          // A display-channel ceiling of 0.24 bounds text-zone relative
          // luminance below 0.047, keeping the existing muted body copy clear.
          var copySafe: vec3f = colour * min(1.0, 0.24 / max(0.001, max(colour.r, max(colour.g, colour.b))));
          colour = mix(colour, copySafe, safeZone);
          var edge: f32 = pow(abs(uv.x - 0.5) * 2.0, 3.0) * 0.12;
          colour *= 1.0 - edge;
          colour = mix(page, colour, smoothstep(0.0, 0.14, uv.y));
          return mix(page, colour, uStrength);
        }
      

        
        
        
        
        
        
        

        fn hash(p: vec2f) -> f32 {
          var q: vec3f = fract(vec3f(p.xyx) * 0.1031);
          q += vec3f(dot(q, q.yzx + vec3f(33.33)));
          return fract((q.x + q.y) * q.z);
        }
        fn noise(p: vec2f) -> f32 {
          var i: vec2f = floor(p); var f: vec2f = fract(p);
          f = f * f * (vec2f(3.0) - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), f.x),
                     mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0)), f.x), f.y);
        }
        fn fbm(source: vec2f) -> f32 {
          var p = source;
          var turn: mat2x2f = mat2x2f(vec2f(0.80, -0.60), vec2f(0.60, 0.80));
          var value: f32 = 0.5333 * noise(p);
          p = turn * p * 2.03 + vec2f(7.1);
          value += 0.2667 * noise(p);
          p = turn * p * 2.01 + vec2f(3.7);
          value += 0.1333 * noise(p);
          p = turn * p * 2.02 + vec2f(9.2);
          return value + 0.0667 * noise(p);
        }
        fn lobe(p: vec2f, centre: vec2f, radius: vec2f) -> f32 {
          var d: vec2f = (p - centre) / radius;
          return exp(-dot(d, d) * 2.0);
        }
        fn shapeBox(p: vec2f, halfSize: vec2f, aa: f32) -> f32 {
          var d: vec2f = abs(p) - halfSize;
          return 1.0 - smoothstep(-aa, aa, max(d.x, d.y));
        }
        // Low buildings stay small enough to read as a distant training field.
        // These are illustrative silhouettes, not a surveyed airport or site.
        fn hangar(baseColour: vec3f, p: vec2f, origin: vec2f, size: vec2f, aa: f32) -> vec3f {
var colour = baseColour;
          var q: vec2f = p - origin;
          var wall: f32 = shapeBox(q - vec2f(0.0, size.y * 0.5), size * vec2f(0.5, 0.5), aa);
          var roofHeight: f32 = size.y + 0.22 * size.x * max(0.0, 1.0 - abs(q.x) / (size.x * 0.53));
          var roof: f32 = (1.0 - smoothstep(size.x * 0.51, size.x * 0.54, abs(q.x)))
                     * smoothstep(size.y - aa, size.y + aa, q.y)
                     * (1.0 - smoothstep(roofHeight - aa, roofHeight + aa, q.y));
          colour = mix(colour, vec3f(0.215, 0.258, 0.262), wall * 0.92);
          colour = mix(colour, vec3f(0.258, 0.294, 0.293), roof * 0.90);
          var door: f32 = shapeBox(q - vec2f(0.0, size.y * 0.42), size * vec2f(0.32, 0.39), aa);
          var ribs: f32 = 0.5 + 0.5 * sin(q.x * 850.0);
          colour = mix(colour, vec3f(0.160, 0.199, 0.208) + vec3f(ribs * 0.009), door * 0.80);
          return colour;
        }
        `);
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => {const p=clamp(n); return p*p*(3-2*p);};
export function create() {
  const scene = new T.Scene(), camera = new T.OrthographicCamera(-1,1,1,-1,0,1);
  const uniforms = {aspect:uniform(1.6), mobile:uniform(0), short:uniform(0), drift:uniform(0), strength:uniform(1), pixel:uniform(.001)};
  const material = new T.MeshBasicNodeMaterial({depthTest:false, depthWrite:false, toneMapped:false, fog:false});
  material.vertexNode = vec4(positionLocal.xy, 0, 1);
  material.colorNode = sRGBTransferEOTF(sky(uv(), uniforms.aspect, uniforms.mobile, uniforms.short, uniforms.drift, uniforms.strength, uniforms.pixel));
  const quad = new T.Mesh(new T.PlaneGeometry(2,2), material); quad.frustumCulled=false; scene.add(quad);
  let opacity = 1;
  return {scene,camera,get opacity(){return opacity;},update({landing=1,progress=0,width=1600,height=1000}) {
    opacity = 1-smooth((progress-.06)/.32);
    uniforms.strength.value=opacity; uniforms.aspect.value=Math.max(.25,Math.min(4,width/height));
    uniforms.mobile.value=width<=760?1:0; uniforms.short.value=width>760&&height<720?1:0;
    uniforms.drift.value=smooth(landing)*.75+smooth(progress)*.18; uniforms.pixel.value=1/height;
    return opacity;
  },dispose(){quad.geometry.dispose(); material.dispose();}};
}
export function groundMaterial(groundUniforms, color) {
  const material = new T.MeshBasicNodeMaterial({color, toneMapped:false, transparent:true});
  const strength=uniform(0), near=uniform(4.5), far=uniform(9);
  material.opacityNode = mix(float(1), float(1).sub(smoothstep(near,far,positionView.z.negate())), strength);
  // Spatial wear is stable under the actual camera, without texture downloads.
  const wear = positionWorld.x.mul(.7).sin().mul(positionWorld.z.mul(6).cos()).mul(.035);
  material.colorNode = uniform(material.color).mul(float(1).add(wear.mul(strength)));
  material.userData.update = () => {strength.value=groundUniforms.sky.value; near.value=groundUniforms.near.value; far.value=groundUniforms.far.value;};
  return material;
}
