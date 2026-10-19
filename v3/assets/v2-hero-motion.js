/* Hero-only, seek-safe choreography in normalized board coordinates.
 * Clear the board, fan into an exploded assembly, then settle. Component CAD,
 * materials and the standalone viewers' motion descriptors remain untouched.
 */
(() => {
  'use strict';

  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
  const seedFor = value => {
    let seed = 2166136261;
    for (const character of value) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
    seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d);
    seed = Math.imul(seed ^ (seed >>> 15), 0x846ca68b);
    seed ^= seed >>> 16;
    return seed >>> 0;
  };
  const familyFor = (ref, bank) => {
    if (/^M2-\d/.test(ref)) return 'screw';
    if (/^Enclosure$/i.test(ref)) return 'enclosure';
    if (/LED/i.test(ref)) return 'led';
    if (bank || /passives|^[RCD]\d/i.test(ref)) return 'passive';
    if (/^[JP]\d/i.test(ref)) return 'connector';
    if (/^(SW|BT)\d/i.test(ref)) return 'switch';
    if (/^[UQ]\d/i.test(ref)) return 'chip';
    return 'component';
  };
  const timing = {
    screw: [0, .012, .75],
    enclosure: [.025, .015, .65],
    connector: [.015, .035, .90],
    chip: [.045, .060, .88],
    switch: [.075, .060, .91],
    component: [.10, .080, .93],
    passive: [.13, .090, .95],
    led: [.16, .085, .96]
  };

  function prepare(parts, metadata = {}) {
    const T = window.THREE;
    if (!T) throw new Error('V2HeroMotion requires THREE');
    for (const [index, part] of parts.entries()) {
      if (part.heroMotion) continue;
      const ref = String(part.ref || part.object.userData.partRef || part.object.name || `component-${index}`);
      const seed = seedFor(ref);
      const a = (seed & 1023) / 1023;
      const b = ((seed >>> 10) & 1023) / 1023;
      const c = ((seed >>> 20) & 1023) / 1023;
      const bank = Boolean(part.object.userData.componentRefs?.length > 1);
      const family = familyFor(ref, bank);
      const schedule = timing[family];
      // Nearby parts lift as a loose wave. Reference jitter prevents a row of
      // identical packages from behaving like one rigid slab.
      const region = clamp((part.base.z + .5) / 1);
      const delay = schedule[0] + schedule[1] * b + region * .035;
      const end = schedule[2] + (a - .5) * .05;
      const offset = (part.motion?.offset || part.offset).clone();
      const baseQuaternion = (part.motion?.baseQuaternion || part.object.quaternion).clone();
      const tilt = family === 'screw' ? .06 : family === 'enclosure' ? .12 : bank ? .046 : family === 'connector' ? .115 : family === 'chip' ? .19 : .22;
      const angles = new T.Vector3((a - .5) * tilt, (b - .5) * tilt * 1.4, (c - .5) * tilt);
      if (family === 'screw') angles.y = Math.PI * (4 + a);
      const settle = new T.Vector3((c - .5) * tilt * .27, (a - .5) * tilt * .20, (b - .5) * tilt * .27);
      const radial = Math.hypot(part.base.x, part.base.z);
      const directionX = radial > .01 ? part.base.x / radial : Math.cos(a * Math.PI * 2);
      const directionZ = radial > .01 ? part.base.z / radial : Math.sin(a * Math.PI * 2);
      const handedness = seed & 1 ? 1 : -1;
      const bend = (.004 + .008 * c) * (family === 'screw' || family === 'enclosure' ? .25 : bank ? .55 : family === 'connector' ? .65 : 1);
      part.heroMotion = {
        name: metadata.name || '', ref, family, bank, offset, baseQuaternion,
        delay, end, clearanceEnd: .20 + a * .045,
        angles, settle,
        curveX: -directionZ * handedness * bend,
        curveZ: directionX * handedness * bend,
        envelopeExtra: bend,
        euler: new T.Euler(), quaternion: new T.Quaternion()
      };
    }
    return parts;
  }

  function apply(parts, phase) {
    const progress = Number.isFinite(phase) ? clamp(phase) : 0;
    for (const part of parts) {
      const motion = part.heroMotion;
      if (!motion) throw new Error('Hero motion must be prepared before use');
      const object = part.object;
      object.position.copy(part.base);
      object.quaternion.copy(motion.baseQuaternion);
      if (progress <= motion.delay) continue;

      const local = clamp((progress - motion.delay) / (motion.end - motion.delay));
      const clearance = smooth(local / motion.clearanceEnd);
      const travel = clamp((local - motion.clearanceEnd) / (1 - motion.clearanceEnd));
      const spread = smooth(travel);
      const lift = .24 * clearance + .76 * spread;
      // A shallow sideways arc adds separation between neighboring packages.
      // Its envelope is zero at both ends, so the original camera framing and
      // the fully exploded assembly's positions are retained.
      const curve = travel === 0 || travel === 1 ? 0 : Math.sin(Math.PI * travel) ** 2;
      object.position.y += motion.offset.y * lift;
      object.position.x += motion.offset.x * spread + motion.curveX * curve;
      object.position.z += motion.offset.z * spread + motion.curveZ * curve;

      const rotation = smooth(travel / .78);
      motion.euler.set(
        motion.angles.x * rotation + motion.settle.x * curve,
        motion.angles.y * rotation + motion.settle.y * curve,
        motion.angles.z * rotation + motion.settle.z * curve
      );
      motion.quaternion.setFromEuler(motion.euler);
      object.quaternion.multiply(motion.quaternion);
    }
    return parts;
  }

  window.V2HeroMotion = Object.freeze({ prepare, apply });
})();
