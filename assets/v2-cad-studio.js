/* Shared camera and lighting for the v2 CAD assembly stages. */
(() => {
  'use strict';

  const boardRotation = Object.freeze({ x: 1.03, y: -0.16, z: -0.26 });

  function create(T, { canvas, capture = false }) {
    const renderer = new T.WebGLRenderer({
      canvas, alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: capture
    });
    renderer.setPixelRatio(capture ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    const scene = new T.Scene();
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);
    scene.add(new T.HemisphereLight(0xffffff, 0xb6c0c2, 0.72));

    const lights = [
      [0xfff5e6, 1.35, -4, 7, 8],
      [0xdaeaff, 0.7, 5, 2, 4],
      [0xffffff, 0.45, -5, -4, 3]
    ];
    lights.forEach(([color, power, x, y, z], index) => {
      const light = new T.DirectionalLight(color, power);
      light.position.set(x, y, z);
      if (index === 0) {
        light.castShadow = true;
        light.shadow.mapSize.set(1536, 1536);
        Object.assign(light.shadow.camera, { left: -1.4, right: 1.4, top: 1.4, bottom: -1.4, near: 0.1, far: 25 });
        light.shadow.bias = -0.00015;
        light.shadow.normalBias = 0.001;
      }
      scene.add(light);
    });

    const room = new T.Scene();
    room.background = new T.Color(0xb5bfc1);
    const material = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide });
    material.color.multiplyScalar(3);
    const panel = new T.Mesh(new T.PlaneGeometry(8, 12), material);
    panel.position.set(-6, 5, 2);
    panel.rotation.y = Math.PI / 2;
    room.add(panel);
    const pmrem = new T.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(room, 0.06);
    scene.environment = environment.texture;
    pmrem.dispose();
    panel.geometry.dispose();
    material.dispose();

    return { renderer, scene, camera, environment };
  }

  function frame(camera, { aspect, bounds, span, zoom }) {
    const width = Math.max(1, aspect);
    const height = Math.max(1, 1 / aspect);
    const extentX = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
    const extentY = Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y));
    const half = Math.max(0.77, span * 0.7, extentX * 1.12 / width, extentY * 1.12 / height) / zoom;
    camera.left = -half * width;
    camera.right = -camera.left;
    camera.top = half * height;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    return half;
  }

  window.V2CadStudio = Object.freeze({ create, frame, boardRotation });
})();
