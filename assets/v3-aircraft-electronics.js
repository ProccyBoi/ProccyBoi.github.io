/* Dimensionally plausible trainer electronics. Hardware names and ratings come
 * from user-supplied sizing sheets; these explanatory shapes are not source CAD.
 * Coordinates are aircraft-local metres: nose +X, up +Y, span Z. */
(() => {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const ramp = (value, from, to) => { const t = clamp((value - from) / (to - from)); return t * t * (3 - 2 * t); };
  const provenance = 'Illustrative electronics geometry and arrangement, not source CAD. Battery 8S / 3300 mAh, ESC 100A and KST-X10 Pro-B servo identities follow user-supplied sizing sheets; receiver hardware is unspecified.';

  function create(T) {
    const group = new T.Group();
    group.name = 'Illustrative aircraft power and control system';
    group.userData = { provenance, illustrative: true, units: 'metres', ownsOpacity: true };
    const materialEntries = [], pieces = [], wires = [], articulations = [], controls = [];
    const geometryCache = new Map();
    function material(name, colour, roughness = .52, metalness = 0, extra = {}) {
      const value = new T.MeshStandardMaterial({ name, color: colour, roughness, metalness, ...extra });
      materialEntries.push({ value, opacity: value.opacity, transparent: value.transparent, depthWrite: value.depthWrite });
      return value;
    }
    const mat = {
      charcoal: material('Electronics charcoal polymer', 0x242a30, .72),
      black: material('Electronics cable black', 0x111719, .67),
      silver: material('Electronics pouch foil', 0xc5c9c5, .34, .66),
      edge: material('Electronics foil seams', 0x798b89, .43, .7),
      orange: material('Electronics amber pack wrap', 0xe7a427, .43),
      label: material('Electronics ivory marking', 0xe5e3d3, .78),
      red: material('Electronics power red', 0xdb4839, .43),
      blue: material('Electronics phase blue', 0x348ac9, .45),
      yellow: material('Electronics phase yellow', 0xe6bd43, .5),
      white: material('Electronics signal ivory', 0xd4d8ca, .7),
      copper: material('Electronics contact copper', 0xb6884b, .3, .8),
      gold: material('Electronics plated connectors', 0xd6b862, .29, .78),
      green: material('Electronics exposed green PCB', 0x21685a, .6),
      solder: material('Electronics solder joints', 0x9daaaa, .35, .8),
      chip: material('Electronics IC moulding', 0x151c21, .76),
      ceramic: material('Electronics ceramic capacitors', 0xa4966e, .82),
      servo: material('Electronics blue servo casing', 0x204b6c, .34, .16),
      strap: material('Electronics woven retaining straps', 0x343b38, .92),
      heatSink: material('Electronics anodized cooling fins', 0x43515a, .35, .64)
    };
    const unitBox = new T.BoxGeometry(1, 1, 1);
    function mesh(parent, geometry, surface, name, position = [0, 0, 0], scale) {
      const result = new T.Mesh(geometry, surface);
      result.name = name; result.position.set(...position);
      if (scale) result.scale.set(...scale);
      result.castShadow = true; result.receiveShadow = true;
      parent.add(result); return result;
    }
    function box(parent, name, size, position, surface) { return mesh(parent, unitBox, surface, name, position, size); }
    function cylinder(parent, name, radius, height, position, surface, radialSegments = 16) {
      if (!geometryCache.has(radialSegments)) geometryCache.set(radialSegments, new T.CylinderGeometry(1, 1, 1, radialSegments));
      return mesh(parent, geometryCache.get(radialSegments), surface, name, position, [radius, height, radius]);
    }
    function screw(parent, x, y, z, radius = .0018) {
      cylinder(parent, 'Recessed screw head', radius, .0011, [x, y, z], mat.silver, 12);
      box(parent, 'Screw driver slot', [radius * 1.4, .00013, radius * .22], [x, y + .00057, z], mat.charcoal);
    }
    function component(name, fitted, exploded, turns, start = .34, end = .61) {
      const object = new T.Group(); object.name = name; object.userData = { illustrative: true, provenance };
      object.position.set(...fitted); group.add(object);
      const part = { object, fitted: new T.Vector3(...fitted), fittedQuaternion: new T.Quaternion(), offset: new T.Vector3(...exploded), turns: new T.Vector3(...turns), start, end };
      pieces.push(part); return part;
    }
    function label(parent, title, detail, width, depth, position) {
      // Canvas labels use system fonts and introduce no image/font downloads.
      if (typeof document === 'undefined') return;
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
      const context = canvas.getContext('2d'); if (!context) return;
      context.fillStyle = '#e8e6d5'; context.fillRect(0, 0, 512, 160);
      context.fillStyle = '#25312f'; context.font = '700 53px sans-serif'; context.fillText(title, 22, 64);
      context.font = '500 28px sans-serif'; context.fillText(detail, 22, 109);
      context.fillRect(22, 126, 102, 5); context.fillRect(134, 126, 29, 5);
      const texture = new T.CanvasTexture(canvas); texture.anisotropy = 2;
      if ('encoding' in texture) texture.encoding = T.sRGBEncoding;
      const surface = material('Generic ' + title + ' label', 0xffffff, .88, 0, { map: texture });
      const plane = mesh(parent, new T.PlaneGeometry(width, depth), surface, title + ' generic label', position);
      plane.rotation.x = -Math.PI / 2;
    }

    // The source floor is y=.193, side walls z=+/-.050, nose bulkhead x=.540.
    // This 139 x 47 x 45 mm pouch pack fits ahead of the wing box.
    const battery = component('Gaoneng 3300 mAh 8S LiPo battery — illustrative geometry', [.320, .224, -.004], [-.030, .249, -.216], [-.12, -.16, .055], .335, .595);
    for (let cell = 0; cell < 8; cell++) {
      const y = -.019 + cell * .0054;
      box(battery.object, 'Separate LiPo pouch cell ' + (cell + 1), [.133, .0046, .041], [0, y, 0], mat.silver);
      box(battery.object, 'Folded foil pouch seam', [.136, .001, .0435], [0, y - .0021, 0], mat.edge);
      for (const side of [-1, 1]) box(battery.object, 'Cell perimeter crimp', [.134, .0041, .0007], [0, y, side * .021], mat.edge);
      box(battery.object, 'Insulated cell end fold', [.003, .0046, .042], [-.067, y, 0], mat.orange);
      box(battery.object, 'Cell terminal tab', [.008, .001, .005], [.069, y + .002, (cell % 2 ? 1 : -1) * .007], mat.copper);
    }
    box(battery.object, 'Pack end cap', [.004, .045, .045], [.07, .001, 0], mat.orange);
    box(battery.object, 'Amber shrink-wrap upper face', [.13, .0011, .044], [0, .0221, 0], mat.orange);
    box(battery.object, 'Pack protective lower face', [.13, .0011, .044], [0, -.0231, 0], mat.charcoal);
    for (const x of [-.041, .040]) {
      box(battery.object, 'Woven battery strap top', [.009, .0024, .049], [x, .024, 0], mat.strap);
      box(battery.object, 'Woven battery strap lower', [.009, .0024, .049], [x, -.025, 0], mat.strap);
      for (const side of [-1, 1]) box(battery.object, 'Battery strap side', [.009, .049, .0021], [x, .0005, side * .0235], mat.strap);
      box(battery.object, 'Strap buckle', [.015, .0032, .011], [x, .026, -.010], mat.charcoal);
      box(battery.object, 'Buckle silver loop', [.011, .001, .007], [x, .028, -.010], mat.edge);
      for (let stitch = -3; stitch <= 3; stitch++) box(battery.object, 'Strap stitching', [.001, .00016, .0016], [x + stitch * .0011, .02525, .015], mat.edge);
    }
    label(battery.object, 'GAONENG', '3300 mAh · 8S LiPo', .045, .016, [0, .0228, 0]);
    const batteryPlug = new T.Group(); batteryPlug.name = 'Keyed battery power plug'; battery.object.add(batteryPlug); batteryPlug.position.set(.081, .004, 0);
    box(batteryPlug, 'Amber keyed power housing', [.014, .012, .018], [0, 0, 0], mat.orange);
    for (const z of [-.004, .004]) {
      const sleeve = cylinder(batteryPlug, 'Power plug socket shroud', .0031, .012, [.006, 0, z], mat.charcoal, 14); sleeve.rotation.z = Math.PI / 2;
      const contact = cylinder(batteryPlug, 'Power plug gold socket', .00175, .013, [.007, 0, z], mat.gold, 12); contact.rotation.z = Math.PI / 2;
    }
    box(battery.object, 'Nine-position 8S balance connector', [.008, .007, .023], [.075, .011, .019], mat.white);
    for (let pin = 0; pin < 9; pin++) box(battery.object, 'Balance connector contact', [.0012, .002, .0008], [.079, .015, .010 + pin * .002], mat.gold);

    // A real-size exposed ESC: individual MOSFETs, fine copper traces,
    // capacitors, cooling fins and terminal pads rather than a featureless box.
    const esc = component('100A electronic speed controller — illustrative geometry', [.486, .226, .004], [.005, .191, -.184], [-.20, .09, -.055], .35, .61);
    box(esc.object, 'ESC circuit board', [.062, .0016, .038], [0, 0, 0], mat.green);
    for (let i = 0; i < 6; i++) {
      box(esc.object, 'MOSFET power package', [.007, .0044, .006], [-.019 + (i % 3) * .013, .003, (i < 3 ? -1 : 1) * .009], mat.chip);
      for (let leg = -1; leg <= 1; leg++) box(esc.object, 'MOSFET silver lead', [.0011, .00055, .009], [-.019 + (i % 3) * .013 + leg * .002, .0013, (i < 3 ? -1 : 1) * .009], mat.solder);
    }
    box(esc.object, 'ESC aluminum thermal plate', [.039, .0018, .027], [-.004, .007, 0], mat.heatSink);
    for (let fin = 0; fin < 10; fin++) box(esc.object, 'Separate ESC cooling fin', [.037, .0086, .00085], [-.004, .0114, -.012 + fin * .00265], mat.heatSink);
    for (const z of [-.010, .009]) {
      cylinder(esc.object, 'Electrolytic input capacitor', .0055, .013, [-.025, .008, z], mat.charcoal, 18);
      cylinder(esc.object, 'Capacitor aluminum cap', .0049, .0006, [-.025, .0148, z], mat.silver, 18);
      box(esc.object, 'Capacitor scored vent', [.006, .00013, .00045], [-.025, .0152, z], mat.charcoal);
      box(esc.object, 'Capacitor polarity stripe', [.0014, .010, .0003], [-.025, .008, z - .0054], mat.label);
    }
    box(esc.object, 'ESC control processor', [.007, .0019, .006], [.023, .002, 0], mat.chip);
    for (let i = 0; i < 6; i++) {
      box(esc.object, 'ESC ceramic and resistor bank', [.0024, .0012, .0014], [.020 + (i % 2) * .006, .0018, -.013 + Math.floor(i / 2) * .012], i % 2 ? mat.charcoal : mat.ceramic);
      box(esc.object, 'PCB copper trace', [.004, .00015, .00045], [.021, .00089, -.013 + i * .005], mat.copper);
    }
    for (const x of [-.028, .028]) for (const z of [-.016, .016]) screw(esc.object, x, .0014, z, .00125);
    for (const z of [-.012, 0, .012]) {
      box(esc.object, 'Motor phase solder pad', [.005, .0005, .005], [.029, .0011, z], mat.gold);
      cylinder(esc.object, 'Solder fillet', .00165, .0006, [.029, .0018, z], mat.solder, 10);
    }
    for (const z of [-.007, .007]) box(esc.object, 'Battery supply solder pad', [.005, .0005, .005], [-.029, .0011, z], mat.gold);

    const receiver = component('Generic radio receiver', [-.111, .214, -.006], [.110, .221, -.174], [-.10, .16, .08], .37, .63);
    box(receiver.object, 'Receiver lower casing', [.049, .013, .031], [0, 0, 0], mat.charcoal);
    box(receiver.object, 'Receiver PCB', [.044, .0013, .027], [0, .0072, 0], mat.green);
    box(receiver.object, 'Receiver shield can', [.019, .0039, .018], [-.009, .010, 0], mat.silver);
    box(receiver.object, 'Receiver processor', [.008, .002, .009], [.010, .009, -.004], mat.chip);
    for (let i = 0; i < 4; i++) {
      box(receiver.object, 'Receiver tiny ceramic', [.0024, .001, .0014], [.005 + i * .004, .0086, .010], mat.ceramic);
      box(receiver.object, 'Receiver header bank', [.004, .0058, .020], [.025, .006, -.007 + i * .0045], mat.charcoal);
      for (let pin = 0; pin < 3; pin++) box(receiver.object, 'Receiver header pin', [.0058, .00085, .00085], [.028, .007 + pin * .002, -.007 + i * .0045], mat.gold);
    }
    for (const z of [-.0115, .0115]) box(receiver.object, 'Receiver lower casing lip', [.048, .002, .002], [0, -.0065, z], mat.black);
    label(receiver.object, 'RX', 'RECEIVER', .017, .008, [-.009, .0121, 0]);
    for (const x of [-.020, .020]) for (const z of [-.012, .012]) screw(receiver.object, x, .0085, z, .001);

    function makeServo(name, fitted, destination, turns, start, end, installation) {
      const offset = destination.map((value, index) => value - fitted[index]);
      const part = component(name + ' — KST-X10 Pro-B, illustrative geometry', fitted, offset, turns, start, end), body = part.object;
      // A thin, flat-mounted case leaves the output shaft normal to the skin.
      // Package dimensions and mounting brackets remain illustrative, not a
      // claim that these installation details exist in the supplied source CAD.
      box(body, 'Thin-wing servo lower case', [.030, .010, .026], [0, 0, 0], mat.servo);
      box(body, 'Thin-wing servo upper gear case', [.030, .002, .0265], [0, .006, 0], mat.servo);
      box(body, 'Servo case seam', [.0303, .00065, .0268], [0, .0049, 0], mat.charcoal);
      for (const x of [-.018, .018]) {
        box(body, 'Servo mounting lug', [.007, .0026, .011], [x, 0, 0], mat.servo);
        box(body, 'Illustrative fixed-structure mounting pad', [.008, .002, .014], [x, -.0026, 0], mat.strap);
        screw(body, x, .0017, 0, .0015);
      }
      cylinder(body, 'Visible servo drive motor', .0041, .008, [.009, 0, 0], mat.silver, 14);
      const gearCarrier = new T.Group(); gearCarrier.name = 'Exposed thin-wing servo gear train'; body.add(gearCarrier);
      articulations.push({ object: gearCarrier, y: 0, travel: .010, from: .48, to: .65 });
      const sizes = [.0032, .0040, .0044], locations = [.010, .001, -.007];
      for (let index = 0; index < 3; index++) {
        const gear = new T.Group(); gear.name = 'Servo brass gear ' + (index + 1); gear.position.set(locations[index], .0068 + index * .0016, 0); gearCarrier.add(gear);
        cylinder(gear, 'Machined brass servo gear', sizes[index], .0018, [0, 0, 0], mat.gold, 20);
        for (let tooth = 0; tooth < 12; tooth++) {
          const angle = tooth / 12 * Math.PI * 2;
          const detail = box(gear, 'Gear tooth', [.0015, .0017, .0013], [Math.cos(angle) * sizes[index], 0, Math.sin(angle) * sizes[index]], mat.copper);
          detail.rotation.y = -angle;
        }
        cylinder(gear, 'Gear spindle', .0011, .003, [0, .001, 0], mat.silver, 10);
      }
      const horn = new T.Group(); horn.name = 'Servo output horn'; horn.position.set(-.007, .014, 0); horn.rotation.y = Math.PI / 2; gearCarrier.add(horn);
      cylinder(horn, 'Servo horn hub', .0037, .0027, [0, 0, 0], mat.white, 16);
      box(horn, 'Servo two arm horn', [.024, .002, .0045], [0, .0005, 0], mat.white);
      for (const x of [-.009, -.006, .006, .009]) cylinder(horn, 'Control rod horn hole', .00066, .00015, [x, .00158, 0], mat.charcoal, 8);
      screw(horn, 0, .0018, 0, .0013);
      box(body, 'Servo lead strain relief', [.004, .0048, .008], [-.016, -.001, 0], mat.black);
      part.outputAnchor = new T.Object3D(); part.outputAnchor.name = name + ' pushrod pin'; part.outputAnchor.position.set(-.009, .0015, 0); horn.add(part.outputAnchor);
      part.fittedQuaternion.setFromEuler(new T.Euler(...(installation.rotation || [0, 0, 0])));
      part.showcase = new T.Vector3(...destination);
      part.showcaseQuaternion = part.fittedQuaternion.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(...turns)));
      part.installation = installation;
      return part;
    }
    // Source CAD hinge planes in aircraft metres: ailerons x=-.145,
    // elevator x=-1.022, rudder x=-.996. Bodies stay FORWARD of those
    // planes, inside fixed structure. Wing cases sit in the .374–.559 m
    // rib bay, rather than on the inboard edge of the moving flaperons.
    const servoTailLeft = makeServo('Elevator servo', [-.949, .243, .060], [-.112, .379, -.250], [-.08, -.26, .08], .47, .65,
      { fixed: 'horizontal-tail-right', control: 'elevator', hingeX: -1.022, surface: [-1.045, .249, .069] });
    const servoTailRight = makeServo('Rudder servo', [-.927, .335, 0], [-.106, .479, -.115], [.04, .18, -.09], .475, .66,
      { fixed: 'vertical-tail', control: 'rudder', hingeX: -.996, surface: [-1.025, .344, -.008], rotation: [-Math.PI / 2, 0, 0] });
    const servoWingLeft = makeServo('Left flaperon servo', [-.112, .310, -.475], [.018, .546, -.117], [-.12, .04, .06], .455, .645,
      { fixed: 'wing-left', control: 'aileron', hingeX: -.145, surface: [-.170, .316, -.466] });
    const servoWingRight = makeServo('Right flaperon servo', [-.112, .310, .475], [.165, .541, -.055], [.12, -.04, -.06], .45, .64,
      { fixed: 'wing-right', control: 'aileron', hingeX: -.145, surface: [-.170, .316, .484] });
    const servos = [servoTailLeft, servoTailRight, servoWingLeft, servoWingRight];
    const linkageGroup = new T.Group(); linkageGroup.name = 'Illustrative control horns and mechanical pushrods'; group.add(linkageGroup);
    for (const servo of servos) {
      const horn = new T.Group(); horn.name = servo.installation.control + ' surface-mounted control horn'; linkageGroup.add(horn);
      box(horn, 'Control surface horn foot', [.009, .0016, .009], [0, 0, 0], mat.white);
      box(horn, 'Control surface horn upright', [.003, .014, .005], [0, .007, 0], mat.white);
      const eye = cylinder(horn, 'Control horn clevis pin', .0015, .006, [0, .014, 0], mat.silver, 10); eye.rotation.x = Math.PI / 2;
      const pickup = new T.Object3D(); pickup.name = 'Control horn pushrod pin'; pickup.position.set(0, .014, 0); horn.add(pickup);
      const rod = cylinder(linkageGroup, servo.object.name + ' steel pushrod', .00072, 1, [0, 0, 0], mat.silver, 10);
      const clevises = [0, 1].map(index => {
        const clevis = new T.Group(); clevis.name = (index ? 'Control' : 'Servo') + ' pushrod clevis'; linkageGroup.add(clevis);
        for (const side of [-1, 1]) box(clevis, 'Clevis fork cheek', [.0011, .005, .0014], [side * .0015, 0, 0], mat.edge);
        cylinder(clevis, 'Threaded pushrod collar', .0014, .004, [0, index ? -.003 : .003, 0], mat.silver, 10);
        return clevis;
      });
      const fitted = new T.Vector3(...servo.installation.surface);
      controls.push({ servo, horn, pickup, rod, clevises, fitted,
        relative: fitted.clone().sub(servo.fitted).applyQuaternion(servo.fittedQuaternion.clone().invert()),
        mount: null, surface: null, installed: new T.Vector3(), target: new T.Vector3(), direction: new T.Vector3(),
        a: new T.Vector3(), b: new T.Vector3(), quaternion: new T.Quaternion(), length: 0 });
    }

    // Two separate receiver aerials, including the stripped-length end sleeves.
    const aerialEnds = [];
    for (let side = 0; side < 2; side++) {
      const aerial = component('Receiver antenna ' + (side + 1), [-.145 - side * .053, .244, (side ? 1 : -1) * .034], [.117 + side * .012, .252, -.145 - side * .038], [0, 0, 0], .39, .65);
      const sleeve = cylinder(aerial.object, 'Antenna active-end sleeve', .00115, .031, [0, 0, 0], mat.black, 10);
      sleeve.rotation.z = side ? -.85 : .55;
      aerialEnds.push(aerial);
    }

    // Motor follows the source object if bound; the fallback matches the original
    // scene's motor extraction. Three insulated phase leads terminate separately.
    let boundMotor = null, airframeBound = false;
    const motorPoint = new T.Vector3(.657, .243, 0), motorLocal = new T.Vector3(), inverseGroup = new T.Matrix4();
    const motorTerminal = component('Motor phase terminal sleeve', [.657, .243, 0], [.350, .040, 0], [0, 0, 0], .41, .67);
    for (const z of [-.009, 0, .009]) {
      const terminal = cylinder(motorTerminal.object, 'Insulated motor bullet socket', .0027, .013, [0, 0, z], mat.charcoal, 12); terminal.rotation.z = Math.PI / 2;
      const pin = cylinder(motorTerminal.object, 'Motor bullet contact', .00165, .002, [-.0065, 0, z], mat.gold, 12); pin.rotation.z = Math.PI / 2;
    }
    function anchor(part, position) { return { part, position: new T.Vector3(...position) }; }
    function resolveAnchor(value, target) {
      target.copy(value.position).applyQuaternion(value.part.object.quaternion).add(value.part.object.position);
    }

    // A reusable swept tube with deterministic cubic centreline. All attributes,
    // tangent frames and endpoint connectors are allocated exactly once.
    const axisY = new T.Vector3(0, 1, 0), axisZ = new T.Vector3(0, 0, 1);
    function cable(name, start, end, colour, radius, lane, bow, plug = false) {
      const segments = 28, sides = 6, vertexCount = (segments + 1) * sides;
      const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3), indices = [];
      for (let segment = 0; segment < segments; segment++) for (let side = 0; side < sides; side++) {
        const a = segment * sides + side, b = segment * sides + (side + 1) % sides, c = a + sides, d = b + sides;
        indices.push(a, b, c, b, d, c);
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
      geometry.setAttribute('normal', new T.BufferAttribute(normals, 3).setUsage(T.DynamicDrawUsage));
      geometry.setIndex(indices);
      const object = mesh(group, geometry, colour, name); object.frustumCulled = false;
      const wire = { name, object, geometry, segments, sides, radius, lane, bow, start, end, positions, normals,
        a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3(), d: new T.Vector3(), point: new T.Vector3(), tangent: new T.Vector3(), normal: new T.Vector3(), binormal: new T.Vector3(), connector: null };
      if (plug) {
        const housing = new T.Group(); housing.name = name + ' inline connector'; group.add(housing);
        box(housing, 'Keyed inline plug', [radius * 4.8, .008, radius * 4.2], [0, 0, 0], mat.charcoal);
        box(housing, 'Connector latch', [radius * 3.4, .004, radius * .9], [0, .001, radius * 2.4], mat.charcoal);
        cylinder(housing, 'Crimp contact collar', radius * 1.7, .0023, [0, -.0048, 0], mat.gold, 10);
        wire.connector = housing;
      }
      wires.push(wire); return wire;
    }
    cable('Battery positive power lead', anchor(battery, [.089, .004, -.004]), anchor(esc, [-.029, .002, -.007]), mat.red, .0016, -1.5, [.045, -.022, -.01], true);
    cable('Battery negative power lead', anchor(battery, [.089, .004, .004]), anchor(esc, [-.029, .002, .007]), mat.black, .0016, -2.6, [.020, -.018, .01], true);
    for (let phase = 0; phase < 3; phase++) cable('Motor phase ' + (phase + 1), anchor(esc, [.030, .002, -.012 + phase * .012]), anchor(motorTerminal, [-.008, 0, -.009 + phase * .009]), [mat.yellow, mat.blue, mat.red][phase], .00125, .8 + phase * .95, [.025, .016, .005], true);
    for (let line = 0; line < 3; line++) cable('ESC receiver control ' + (line + 1), anchor(receiver, [.030, .007 + line * .002, -.010]), anchor(esc, [-.019, .002, .017 + line * .0015]), [mat.black, mat.red, mat.white][line], .00064, 1 + line * .37, [.003, .011, -.006], line === 1);
    for (let servoIndex = 0; servoIndex < servos.length; servoIndex++) for (let line = 0; line < 3; line++) {
      const servo = servos[servoIndex];
      cable(servo.object.name + [' ground', ' supply', ' signal'][line], anchor(receiver, [.030, .006 + line * .002, -.004 + servoIndex * .0045]), anchor(servo, [-.018, -.001, -.002 + line * .002]), [mat.black, mat.red, mat.orange][line], .00061, (servoIndex - 1.5) * 1.20 + line * .26, [-.020, .015 + servoIndex * .003, servoIndex > 1 ? (servoIndex === 2 ? -.025 : .025) : -.010], line === 1);
    }
    for (let i = 0; i < 2; i++) cable('Receiver antenna coax ' + (i + 1), anchor(receiver, [-.023, .005, (i ? 1 : -1) * .008]), anchor(aerialEnds[i], [0, -.012, 0]), mat.black, .00065, -1.7 - i * .6, [-.025, .026, -.011]);
    // A small multicolour balance harness ends at its own white plug on the pack.
    for (let i = 0; i < 9; i++) cable('Battery cell balance lead ' + (i + 1), anchor(battery, [.068, -.019 + Math.min(i, 7) * .0054, .017]), anchor(battery, [.074, .012, .010 + i * .002]), i === 8 ? mat.red : mat.black, .00038, -.25 + i * .075, [.015, .012, .006]);

    function updateWire(wire, spread) {
      resolveAnchor(wire.start, wire.a); resolveAnchor(wire.end, wire.d);
      const extent = Math.min(.13, wire.a.distanceTo(wire.d) * .25);
      wire.b.copy(wire.a).lerp(wire.d, .29);
      wire.c.copy(wire.a).lerp(wire.d, .72);
      // During assembly the leads hug the bay. The same endpoint-preserving
      // paths unfurl into clearly separated colour lanes for inspection.
      wire.b.x += wire.bow[0] * (1 + spread * .9);
      wire.b.y += wire.bow[1] + spread * (extent * .32 + Math.abs(wire.lane) * .009);
      wire.b.z += wire.bow[2] + spread * wire.lane * .024;
      wire.c.x -= wire.bow[0] * .42;
      wire.c.y += wire.bow[1] * .6 + spread * (extent * .24 + Math.abs(wire.lane) * .012);
      wire.c.z += wire.bow[2] * .55 + spread * wire.lane * .021;
      for (let segment = 0; segment <= wire.segments; segment++) {
        const t = segment / wire.segments, s = 1 - t;
        wire.point.copy(wire.a).multiplyScalar(s * s * s).addScaledVector(wire.b, 3 * s * s * t).addScaledVector(wire.c, 3 * s * t * t).addScaledVector(wire.d, t * t * t);
        wire.tangent.copy(wire.b).sub(wire.a).multiplyScalar(3 * s * s);
        wire.normal.copy(wire.c).sub(wire.b); wire.tangent.addScaledVector(wire.normal, 6 * s * t);
        wire.normal.copy(wire.d).sub(wire.c); wire.tangent.addScaledVector(wire.normal, 3 * t * t).normalize();
        wire.normal.crossVectors(wire.tangent, Math.abs(wire.tangent.y) > .93 ? axisZ : axisY).normalize();
        wire.binormal.crossVectors(wire.tangent, wire.normal).normalize();
        for (let side = 0; side < wire.sides; side++) {
          const angle = side / wire.sides * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
          const nx = wire.normal.x * cos + wire.binormal.x * sin, ny = wire.normal.y * cos + wire.binormal.y * sin, nz = wire.normal.z * cos + wire.binormal.z * sin;
          const index = (segment * wire.sides + side) * 3;
          wire.positions[index] = wire.point.x + nx * wire.radius;
          wire.positions[index + 1] = wire.point.y + ny * wire.radius;
          wire.positions[index + 2] = wire.point.z + nz * wire.radius;
          wire.normals[index] = nx; wire.normals[index + 1] = ny; wire.normals[index + 2] = nz;
        }
        if (wire.connector && segment === 7) { wire.connector.position.copy(wire.point); wire.connector.quaternion.setFromUnitVectors(axisY, wire.tangent); }
      }
      wire.geometry.attributes.position.needsUpdate = true; wire.geometry.attributes.normal.needsUpdate = true;
      wire.geometry.computeBoundingBox(); wire.geometry.computeBoundingSphere();
    }

    // Merge static detail within each independently moving group. This keeps all
    // the teeth, leads, stitches and fasteners without hundreds of draw calls.
    function batch(parent) {
      for (const child of [...parent.children]) if (child.isGroup) batch(child);
      const batches = new Map();
      for (const child of [...parent.children]) if (child.isMesh && !child.material.map) {
        child.updateMatrix();
        if (!batches.has(child.material)) batches.set(child.material, []);
        batches.get(child.material).push(child);
      }
      for (const [surface, items] of batches) {
        if (items.length < 2) continue;
        let count = 0; for (const item of items) count += item.geometry.index ? item.geometry.index.count : item.geometry.attributes.position.count;
        const vertices = new Float32Array(count * 3), normals = new Float32Array(count * 3);
        let offset = 0;
        for (const item of items) {
          const geometry = item.geometry.index ? item.geometry.toNonIndexed() : item.geometry.clone(); geometry.applyMatrix4(item.matrix);
          vertices.set(geometry.attributes.position.array, offset); normals.set(geometry.attributes.normal.array, offset);
          offset += geometry.attributes.position.array.length; geometry.dispose(); parent.remove(item);
        }
        const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(vertices, 3)); geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        const result = mesh(parent, geometry, surface, surface.name + ' merged detail'); result.userData.detailParts = items.length;
      }
    }
    for (const part of pieces) batch(part.object);
    for (const control of controls) { batch(control.horn); for (const clevis of control.clevises) batch(clevis); }
    for (const wire of wires) if (wire.connector) batch(wire.connector);
    let triangles = 0, meshCount = 0;
    group.traverse(item => { if (item.isMesh) { meshCount++; triangles += (item.geometry.index?.count || item.geometry.attributes.position.count) / 3; } });
    let progress = 0, previous = -1;
    function setProgress(value) {
      const next = Number.isFinite(value) ? clamp(value) : 0;
      if (next === previous && !boundMotor && !airframeBound) return;
      progress = next; previous = next;
      const visibility = ramp(progress, .18, .32) * (1 - ramp(progress, .80, .92));
      group.visible = visibility > .0001;
      for (const part of pieces) {
        const amount = ramp(progress, part.start, part.end);
        part.object.position.copy(part.fitted).addScaledVector(part.offset, amount);
        part.object.rotation.set(part.turns.x * amount, part.turns.y * amount, part.turns.z * amount);
        part.object.quaternion.premultiply(part.fittedQuaternion);
      }
      group.updateWorldMatrix(true, false); inverseGroup.copy(group.matrixWorld).invert();
      for (const control of controls) updateControlPlacement(control);
      if (boundMotor) {
        boundMotor.updateWorldMatrix(true, false); group.updateWorldMatrix(true, false); inverseGroup.copy(group.matrixWorld).invert();
        motorPoint.copy(motorLocal).applyMatrix4(boundMotor.matrixWorld).applyMatrix4(inverseGroup);
        motorTerminal.object.position.copy(motorPoint);
      }
      for (const part of articulations) part.object.position.y = part.y + part.travel * ramp(progress, part.from, part.to);
      if (typeof focus !== 'undefined') {
        focus.position.copy(battery.object.position).lerp(receiver.object.position, .53); focus.position.y += .025;
        wiringAnchor.position.copy(battery.object.position).lerp(receiver.object.position, .5); wiringAnchor.position.z -= .055;
      }
      group.updateWorldMatrix(true, true);
      for (const control of controls) updatePushrod(control);
      const spread = ramp(progress, .405, .65);
      for (const wire of wires) updateWire(wire, spread);
      for (const entry of materialEntries) {
        const transparent = entry.transparent || visibility < .999;
        if (entry.value.transparent !== transparent) { entry.value.transparent = transparent; entry.value.needsUpdate = true; }
        entry.value.opacity = entry.opacity * visibility;
        entry.value.depthWrite = visibility > .995 && entry.depthWrite;
      }
    }
    // Store the inverse SOURCE transform at assembly. The delta cancels the
    // source's millimetre scale and mirrored left-wing transform, leaving a
    // rigid aircraft-local transform without reparenting or editing source CAD.
    function binding(object) {
      if (!object) return null;
      object.updateWorldMatrix(true, false);
      return { object, restInverse: new T.Matrix4().multiplyMatrices(inverseGroup, object.matrixWorld).invert(), delta: new T.Matrix4(),
        position: new T.Vector3(), quaternion: new T.Quaternion(), scale: new T.Vector3() };
    }
    function refreshBinding(value) {
      if (!value) return;
      value.object.updateWorldMatrix(true, false);
      value.delta.multiplyMatrices(inverseGroup, value.object.matrixWorld).multiply(value.restInverse);
      value.delta.decompose(value.position, value.quaternion, value.scale);
    }
    function updateControlPlacement(control) {
      const servo = control.servo, amount = ramp(progress, servo.start, servo.end);
      refreshBinding(control.mount); refreshBinding(control.surface);
      control.installed.copy(servo.fitted);
      control.quaternion.copy(servo.fittedQuaternion);
      if (control.mount) {
        control.installed.applyMatrix4(control.mount.delta);
        control.quaternion.premultiply(control.mount.quaternion);
      }
      servo.object.position.copy(control.installed).lerp(servo.showcase, amount);
      servo.object.quaternion.copy(control.quaternion).slerp(servo.showcaseQuaternion, amount);
      // The control horn starts on its real moving surface. During extraction
      // the complete illustrative linkage comes away with its servo, so no rod
      // stretches across the exploded airframe or remains in the close-up.
      control.installed.copy(control.fitted);
      control.quaternion.copy(servo.fittedQuaternion);
      if (control.surface) {
        control.installed.applyMatrix4(control.surface.delta);
        control.quaternion.premultiply(control.surface.quaternion);
      }
      control.target.copy(control.relative).applyQuaternion(servo.showcaseQuaternion).add(servo.showcase);
      control.horn.position.copy(control.installed).lerp(control.target, amount);
      control.horn.quaternion.copy(control.quaternion).slerp(servo.showcaseQuaternion, amount);
    }
    function updatePushrod(control) {
      control.a.setFromMatrixPosition(control.servo.outputAnchor.matrixWorld).applyMatrix4(inverseGroup);
      control.b.setFromMatrixPosition(control.pickup.matrixWorld).applyMatrix4(inverseGroup);
      control.direction.subVectors(control.b, control.a); control.length = control.direction.length();
      control.direction.multiplyScalar(1 / Math.max(control.length, 1e-9));
      control.rod.position.copy(control.a).lerp(control.b, .5);
      control.rod.quaternion.setFromUnitVectors(axisY, control.direction); control.rod.scale.y = control.length;
      for (let index = 0; index < 2; index++) {
        control.clevises[index].position.copy(index ? control.b : control.a);
        control.clevises[index].quaternion.copy(control.rod.quaternion);
      }
    }
    function bindAirframe(parts, carrier) {
      group.updateWorldMatrix(true, false); inverseGroup.copy(group.matrixWorld).invert();
      for (const control of controls) {
        const fixed = parts.find(part => part.category === control.servo.installation.fixed)?.object;
        let moving = null;
        fixed?.traverse(object => {
          if (!moving && object !== fixed && (object.userData.category || '').startsWith(control.servo.installation.control)) moving = object;
        });
        control.mount = binding(fixed); control.surface = binding(moving);
      }
      airframeBound = controls.some(control => control.mount);
      previous = -1; setProgress(progress);
      return controls.every(control => control.mount && control.surface);
    }
    function bindMotor(object) {
      if (!object) { boundMotor = null; return; }
      group.updateWorldMatrix(true, false); object.updateWorldMatrix(true, false);
      motorLocal.set(.657, .243, 0).applyMatrix4(group.matrixWorld); object.worldToLocal(motorLocal);
      boundMotor = object; previous = -1; setProgress(progress);
    }
    function setLanding() { setProgress(0); }
    function assemblyError() {
      let error = 0;
      for (const part of pieces) error = Math.max(error, part.object.position.distanceTo(part.fitted), 1 - Math.abs(part.object.quaternion.dot(part.fittedQuaternion)));
      for (const part of articulations) error = Math.max(error, Math.abs(part.object.position.y - part.y));
      return error;
    }
    const focus = new T.Object3D(); focus.name = 'Electronics showcase focus'; group.add(focus);
    const wiringAnchor = new T.Object3D(); wiringAnchor.name = 'Individual power and control wiring'; group.add(wiringAnchor);
    const boundsScratch = new T.Box3();
    function showcaseBounds(target = new T.Box3()) {
      group.updateWorldMatrix(true, true); target.makeEmpty();
      for (const part of pieces) if (part !== motorTerminal) target.union(boundsScratch.setFromObject(part.object));
      target.union(boundsScratch.setFromObject(linkageGroup));
      return target;
    }
    const anchors = { battery: battery.object, esc: esc.object, receiver: receiver.object, servos: servoTailLeft.object, wiring: wiringAnchor };
    setProgress(0);
    return {
      group, setProgress, setLanding, bindMotor, bindAirframe, assemblyError, focus, anchors, showcaseBounds,
      statistics: Object.freeze({ provenance, illustrative: true, components: 7, batteryCells: 8, servos: 4, pushrods: controls.length, antennae: 2, wires: wires.length, wireSegments: 28, meshes: meshCount, triangles }),
      inspect() { return { progress, visible: group.visible, opacity: materialEntries[0].value.opacity, spread: ramp(progress, .405, .65), assemblyError: assemblyError(), positions: pieces.map(part => ({ name: part.object.name, position: part.object.position.toArray() })),
        controls: controls.map(control => ({ servo: control.servo.object.name, fixed: control.servo.installation.fixed,
          boundFixed: control.mount?.object.name || null, boundControl: control.surface?.object.name || null,
          hingeX: control.servo.installation.hingeX, fitted: control.servo.fitted.toArray(),
          installedSurface: control.fitted.toArray(), surface: control.horn.position.toArray(),
          outputPin: control.a.toArray(), controlPin: control.b.toArray(), pushrodLength: control.length })) }; }
    };
  }
  window.V3AircraftElectronics = Object.freeze({ create });
})();
