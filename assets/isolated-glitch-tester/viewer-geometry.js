const RAD = Math.PI / 180;

export function boardPoint(board, x, y) {
  return [x - (board.bounds.minX + board.bounds.maxX) / 2, (board.bounds.minY + board.bounds.maxY) / 2 - y];
}

function footprintPoint(component, x, y) {
  const angle = component.rotation * RAD;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [component.x + x * cos + y * sin, component.y - x * sin + y * cos];
}

function slotPoints(width, height, segments = 16) {
  const radius = Math.min(width, height) / 2;
  const dx = width / 2 - radius;
  const dy = height / 2 - radius;
  return Array.from({ length: segments }, (_, index) => {
    const angle = index * Math.PI * 2 / segments;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [radius * cos + Math.sign(cos) * dx, radius * sin + Math.sign(sin) * dy];
  });
}

function pathFromPoints(path, points) {
  path.moveTo(...points[0]);
  points.slice(1).forEach(point => path.lineTo(...point));
  path.closePath();
  return path;
}

function makeBoardShape(THREE, board) {
  const shape = pathFromPoints(new THREE.Shape(), board.outlineLoop.map(([x, y]) => boardPoint(board, x, y)));
  const drills = board.vias.map(via => {
    return { x: via.x, y: via.y, width: via.drill, height: via.drill, rotation: 0 };
  });
  for (const component of board.components) {
    for (const pad of component.pads) {
      if (!pad.drill) continue;
      const [x, y] = pad.drillCenter || footprintPoint(component, pad.x, pad.y);
      drills.push({ x, y, width: pad.drill[0], height: pad.drill[1], rotation: pad.absoluteRotation ?? pad.rotation });
    }
  }
  const positions = new Set();
  for (const drill of drills) {
    const [cx, cy] = boardPoint(board, drill.x, drill.y);
    const key = [cx.toFixed(3), cy.toFixed(3)].join(',');
    if (positions.has(key)) continue;
    positions.add(key);
    const angle = drill.rotation * RAD;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const segments = Math.max(drill.width, drill.height) > 1 ? 24 : 12;
    const points = slotPoints(drill.width, drill.height, segments).map(([x, y]) => {
      return [cx + x * cos - y * sin, cy + x * sin + y * cos];
    });
    shape.holes.push(pathFromPoints(new THREE.Path(), points));
  }
  return shape;
}

function drawGraphic(context, graphic) {
  const { type, start, end, center, points, width } = graphic;
  context.lineWidth = width || 0.1;
  context.beginPath();
  if (type === 'line' || type === 'segment') {
    context.moveTo(...start);
    context.lineTo(...end);
  } else if (type === 'rect') {
    context.rect(...start, end[0] - start[0], end[1] - start[1]);
  } else if (type === 'circle') {
    context.arc(...center, Math.hypot(end[0] - center[0], end[1] - center[1]), 0, 2 * Math.PI);
  } else if (type === 'arc') {
    const [sx, sy] = start;
    const [mx, my] = graphic.mid;
    const [ex, ey] = end;
    const determinant = 2 * (sx * (my - ey) + mx * (ey - sy) + ex * (sy - my));
    if (Math.abs(determinant) < 1e-6) return;
    const a = sx * sx + sy * sy;
    const b = mx * mx + my * my;
    const c = ex * ex + ey * ey;
    const x = (a * (my - ey) + b * (ey - sy) + c * (sy - my)) / determinant;
    const y = (a * (ex - mx) + b * (sx - ex) + c * (mx - sx)) / determinant;
    context.arc(x, y, Math.hypot(sx - x, sy - y), Math.atan2(sy - y, sx - x), Math.atan2(ey - y, ex - x), determinant < 0);
  } else if (type === 'polygon' && points.length) {
    context.moveTo(...points[0]);
    points.slice(1).forEach(point => context.lineTo(...point));
    context.closePath();
    context.fill();
    if (!width) return;
  } else {
    return;
  }
  context.stroke();
}

function drawLabel(context, label, x, y) {
  context.save();
  context.translate(x, y);
  context.rotate(-label.rotation * RAD);
  if (label.justify.includes('mirror')) context.scale(-1, 1);
  context.textAlign = label.justify.includes('left') ? 'left' : label.justify.includes('right') ? 'right' : 'center';
  context.textBaseline = label.justify.includes('bottom') ? 'bottom' : 'middle';
  context.font = `500 ${label.height * 1.24}px monospace`;
  label.text.trim().split('\n').forEach((line, index) => context.fillText(line, 0, label.height * 1.45 * index));
  context.restore();
}

function drawBoardFace(context, canvas, board, face, images) {
  const isFront = face === 'front';
  const silkLayer = isFront ? 'F.SilkS' : 'B.SilkS';
  const copperLayer = isFront ? 'F.Cu' : 'B.Cu';
  const maskLayer = isFront ? 'F.Mask' : 'B.Mask';
  const density = canvas.width / board.width;
  const tintCanvas = document.createElement('canvas');
  tintCanvas.width = canvas.width;
  tintCanvas.height = canvas.height;
  const tint = tintCanvas.getContext('2d');
  const layer = (image, color) => {
    tint.clearRect(0, 0, canvas.width, canvas.height);
    tint.globalCompositeOperation = 'source-over';
    tint.drawImage(image, 0, 0, canvas.width, canvas.height);
    tint.globalCompositeOperation = 'source-in';
    tint.fillStyle = color;
    tint.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(tintCanvas, board.bounds.minX, board.bounds.minY, board.width, board.height);
  };

  context.save();
  context.scale(density, canvas.height / board.height);
  context.translate(-board.bounds.minX, -board.bounds.minY);
  context.fillStyle = '#242929';
  context.fillRect(board.bounds.minX, board.bounds.minY, board.width, board.height);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (images.copper) {
    layer(images.copper, '#303636');
  } else {
    context.strokeStyle = '#333a39';
    board.tracks.filter(track => track.layer === copperLayer).forEach(track => drawGraphic(context, track));
  }

  if (images.mask) {
    layer(images.mask, '#b79a63');
  } else {
    context.fillStyle = '#b79a63';
    board.vias.forEach(via => {
      context.beginPath();
      context.arc(via.x, via.y, via.diameter / 2, 0, Math.PI * 2);
      context.fill();
    });
    for (const component of board.components) {
      for (const pad of component.pads) {
        if (!pad.layers.includes(maskLayer) && !pad.layers.includes('*.Mask')) continue;
        context.save();
        context.translate(...(pad.absolute || footprintPoint(component, pad.x, pad.y)));
        context.rotate(-(pad.absoluteRotation ?? pad.rotation) * RAD);
        context.beginPath();
        if (pad.shape === 'circle' || pad.shape === 'oval' || pad.shape === 'roundrect') {
          const radius = Math.min(pad.width, pad.height) / (pad.shape === 'roundrect' ? 4 : 2);
          context.roundRect(-pad.width / 2, -pad.height / 2, pad.width, pad.height, radius);
        } else {
          context.rect(-pad.width / 2, -pad.height / 2, pad.width, pad.height);
        }
        context.fill();
        context.restore();
      }
    }
  }

  if (images.silk) {
    layer(images.silk, '#efefe2');
  } else {
    context.fillStyle = '#efefe2';
    context.strokeStyle = '#efefe2';
    board.silk.filter(graphic => graphic.layer === silkLayer).forEach(graphic => drawGraphic(context, graphic));
    board.labels.filter(label => label.layer === silkLayer).forEach(label => drawLabel(context, label, label.x, label.y));
    for (const component of board.components) {
      context.save();
      context.translate(component.x, component.y);
      context.rotate(-component.rotation * RAD);
      component.silk.filter(graphic => graphic.layer === silkLayer).forEach(graphic => drawGraphic(context, graphic));
      context.restore();
      for (const label of component.labels) {
        if (label.layer !== silkLayer) continue;
        drawLabel(context, label, ...footprintPoint(component, label.x, label.y));
      }
    }
  }
  context.restore();
}

function loadImage(url) {
  return new Promise(resolve => {
    if (!url) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export function buildBoard(THREE, board, artwork, resolveAsset, redraw, anisotropy) {
  const assembly = new THREE.Group();
  const shape = makeBoardShape(THREE, board);
  const edge = new THREE.ExtrudeGeometry(shape, { depth: board.thickness, bevelEnabled: false });
  edge.translate(0, 0, -board.thickness / 2);
  const boardBody = new THREE.Mesh(edge, new THREE.MeshStandardMaterial({ color: '#9a7958', roughness: 0.87 }));
  assembly.add(boardBody);
  const geometry = new THREE.ShapeGeometry(shape);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < position.count; index += 1) {
    uv.setXY(index, position.getX(index) / board.width + 0.5, position.getY(index) / board.height + 0.5);
  }
  for (const face of ['front', 'back']) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.round(canvas.width * board.height / board.width);
    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = anisotropy;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.74, side: THREE.DoubleSide });
    const surface = new THREE.Mesh(geometry, material);
    surface.position.z = (board.thickness / 2 + 0.005) * (face === 'front' ? 1 : -1);
    assembly.add(surface);
    drawBoardFace(context, canvas, board, face, {});
    const layers = artwork?.[face];
    if (!layers) continue;
    Promise.all(Object.entries(layers).map(async ([key, path]) => [key, await loadImage(resolveAsset(path))]))
      .then(entries => {
        drawBoardFace(context, canvas, board, face, Object.fromEntries(entries));
        texture.needsUpdate = true;
        redraw();
      });
  }
  return { assembly, boardBody };
}

export function makeComponentFactory(THREE) {
  const materials = Object.fromEntries(
    Object.entries({
      polymer: '#272a2b',
      ceramic: '#947c63',
      silver: '#bcc6c3',
      gold: '#bb9352',
      copper: '#886647',
      led: '#c9c8b4',
      green: '#507d52',
      blue: '#315a74',
      paper: '#e9e9d9'
    }).map(([name, color]) => [name, new THREE.MeshStandardMaterial({
      color, roughness: name === 'silver' ? 0.32 : 0.58, metalness: ['gold', 'silver'].includes(name) ? 0.45 : 0
    })])
  );

  const boxes = new Map();
  const cylinders = new Map();
  function box(group, width, depth, height, x, y, z, material) {
    const key = [width, depth, height].join(',');
    if (!boxes.has(key)) boxes.set(key, new THREE.BoxGeometry(width, depth, height));
    const mesh = new THREE.Mesh(boxes.get(key), materials[material]);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  function cylinder(group, radius, height, x, y, z, material, sides = 28, radiusTop = radius) {
    const key = [radius, radiusTop, height, sides].join(',');
    if (!cylinders.has(key)) {
      const geometry = new THREE.CylinderGeometry(radiusTop, radius, height, sides);
      geometry.rotateX(Math.PI / 2);
      cylinders.set(key, geometry);
    }
    const mesh = new THREE.Mesh(cylinders.get(key), materials[material]);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function platedHole(group, pad) {
    const radius = pad.width / 2;
    const opening = pad.drill[0] / 2;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius * 1.06, 0, 2 * Math.PI, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, opening, 0, 2 * Math.PI, true);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false, curveSegments: 24 });
    geometry.translate(0, 0, -1.6);
    group.add(new THREE.Mesh(geometry, materials.polymer));
    const face = new THREE.Mesh(new THREE.RingGeometry(opening, radius, 48), materials.gold);
    face.position.z = 0.01;
    group.add(face);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(opening, opening, 1.6, 48, 1, true), materials.gold.clone());
    barrel.material.side = THREE.BackSide;
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.8;
    group.add(barrel);
  }

  function logo(group, component, sign) {
    const polygons = component.silk.filter(graphic => graphic.type === 'polygon');
    const points = polygons.flatMap(graphic => graphic.points);
    const [minX, minY, maxX, maxY] = [
      Math.min(...points.map(point => point[0])), Math.min(...points.map(point => point[1] * sign)),
      Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[1] * sign))
    ];
    if (!points.length) return;
    box(group, maxX - minX + 1, maxY - minY + 1, 1.6, (maxX + minX) / 2, (maxY + minY) / 2, -0.8, 'polymer');
    for (const polygon of polygons) {
      const shape = pathFromPoints(new THREE.Shape(), polygon.points.map(([x, y]) => [x, y * sign]));
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), materials.paper);
      mesh.position.z = 0.01;
      group.add(mesh);
    }
  }

  return component => {
    const group = new THREE.Group();
    const sideSign = component.side === 'bottom' ? 1 : -1;
    const { minX, minY, maxX, maxY } = component.bounds;
    const width = Math.max(0.3, maxX - minX);
    const depth = Math.max(0.3, maxY - minY);
    const x = (minX + maxX) / 2;
    const y = (minY + maxY) / 2 * sideSign;
    const footprint = component.footprint;

    if (footprint.startsWith('MountingHole:')) {
      if (component.pads[0]?.drill) platedHole(group, component.pads[0]);
      return group;
    }
    if (component.attributes.includes('board_only')) {
      logo(group, component, sideSign);
      return group;
    }

    let height = Math.min(2.5, Math.max(0.55, Math.min(width, depth) * 0.52));
    const isRotary = footprint.includes('CK1050');
    const isToggle = footprint.includes('Toggle') || footprint.includes('100SP');
    const isPot = footprint.includes('RK09');
    const isLensedLED = footprint.includes('LED_THT');
    const isTerminal = footprint.includes('TerminalBlock');
    const isHeader = footprint.includes('PinHeader') || footprint.includes('PinSocket');
    const isTHDiode = footprint.includes('Diode_THT');
    const isChip = footprint.includes('SOIC') || footprint.includes('SOT') || footprint.includes('SOP') || footprint.includes('RBE01');

    if (isRotary) {
      height = 8.5;
      cylinder(group, width / 2, height, x, y, height / 2, 'polymer');
      cylinder(group, 5, 8, x, y, height + 4, 'silver');
      cylinder(group, 6.8, 2, x, y, height + 3.2, 'silver', 6);
      cylinder(group, 3, 42, x, y, height + 29, 'silver');
    } else if (isToggle) {
      height = 6.5;
      box(group, width, depth, height, x, y, height / 2, 'polymer');
      box(group, width, depth, 0.48, x, y, height + 0.24, 'silver');
      cylinder(group, 3.03, 5.6, x, y, height + 2.8, 'silver');
      cylinder(group, 3.8, 1.0, x, y, height + 2.65, 'silver', 6);
      const lever = cylinder(group, 1.2, 8, x + 1.38, y, height + 8.25, 'silver', 18, 0.92);
      lever.rotation.y = 0.35;
    } else if (isPot) {
      height = 7.5;
      box(group, width, depth, height, x, y, height / 2, 'polymer');
      box(group, width * 0.94, depth * 0.96, 0.55, x, y, height + 0.275, 'silver');
      cylinder(group, 3.95, 3.4, x, y, height + 1.7, 'silver', 6);
      cylinder(group, 2.95, 19.1, x, y, height + 12.95, 'polymer', 24, 2.7);
    } else if (isLensedLED) {
      height = 8.2;
      const radius = 2.5;
      cylinder(group, radius * 1.1, 0.6, x, y, 0.3, 'led');
      cylinder(group, radius, 4.9, x, y, 3, 'led');
      const lens = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), materials.led);
      lens.position.set(x, y, 5.25);
      group.add(lens);
    } else if (isTerminal) {
      height = 9;
      box(group, width, depth, height, x, y, height / 2, 'green');
      for (const pad of component.pads) {
        const px = pad.x;
        const py = pad.y * sideSign;
        cylinder(group, 1.5, 0.12, px, py, height + 0.06, 'silver');
        box(group, 2.0, 0.34, 0.06, px, py, height + 0.15, 'polymer');
        box(group, 2.85, 0.12, 3.4, px, y + depth / 2, height * 0.42, 'polymer');
      }
    } else if (isHeader) {
      height = footprint.includes('PinSocket') ? 8.5 : 2.5;
      box(group, width, depth, height, x, y, height / 2, 'polymer');
    } else if (isTHDiode) {
      height = depth;
      const bodyLength = Math.min(width, 5.3);
      const body = cylinder(group, depth / 2, bodyLength, x, y, depth / 2 + 0.8, 'polymer');
      body.rotateY(Math.PI / 2);
      const stripe = cylinder(group, depth * 0.505, 0.44, x - bodyLength * 0.34, y, depth / 2 + 0.8, 'silver');
      stripe.rotateY(Math.PI / 2);
      box(group, Math.max(width, 10.16), 0.65, 0.65, x, y, depth / 2 + 0.8, 'silver');
    } else {
      const body = footprint.includes('Capacitor') ? 'ceramic' : footprint.includes('LED_SMD') ? 'led' : 'polymer';
      const clearance = isChip ? 0.2 : 0.075;
      box(group, width, depth, height, x, y, height / 2 + clearance, body);
      if (isChip && width > 2) {
        cylinder(group, Math.min(width, depth) * 0.075, 0.035, minX + width * 0.18, y + depth * 0.34, height + clearance, 'silver', 16);
      }
    }

    for (const pad of component.pads) {
      const py = pad.y * sideSign;
      if (pad.drill) {
        const pinWidth = Math.min(0.85, pad.drill[0] * 0.64);
        const pinDepth = Math.min(2, pad.drill[1] * 0.63);
        const pinHeight = isHeader && !footprint.includes('PinSocket') ? 11 : 4.2;
        box(group, pinWidth, pinDepth, pinHeight, pad.x, py, pinHeight / 2 - 2.6, 'silver');
      } else if (pad.type === 'smd') {
        const foot = box(group, pad.width * 0.71, pad.height * 0.75, isChip ? 0.2 : height * 0.9, pad.x, py, isChip ? 0.15 : height * 0.47, 'silver');
        foot.rotation.z = ((pad.absoluteRotation ?? pad.rotation) - component.rotation) * RAD * (component.side === 'top' ? 1 : -1);
        if (isChip) {
          const leadX = x + Math.sign(pad.x - x) * width * 0.43;
          const leadY = Math.max(y - depth * 0.46, Math.min(y + depth * 0.46, py));
          const length = Math.hypot(pad.x - leadX, py - leadY);
          const lead = box(group, Math.max(0.1, length), Math.min(pad.width, pad.height) * 0.52, 0.17, (pad.x + leadX) / 2, (py + leadY) / 2, height * 0.4, 'silver');
          lead.rotation.z = Math.atan2(py - leadY, pad.x - leadX);
        }
      }
    }
    return group;
  };
}
