/* A sleeping OLED blink, paced by the owning scene's completed draws.
   No character controller, animation loop, geometry or extra model assets. */
(() => {
  'use strict';
  const imageURL = '/assets/images/v2/dash-idle-display.png';
  let idleImage;
  const loadImage = () => idleImage ||= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => { idleImage = null; reject(new Error('Dash idle display unavailable')); };
    image.src = imageURL;
  });
  async function mount(model, { invalidate, allowed = () => true, diagnostics } = {}) {
    const screen = model.group.getObjectByName?.('Inactive OLED viewing area');
    if (!screen || !window.THREE) return null;
    const original = screen.material, originalZ = screen.position.z;
    const existing = original.map?.image;
    const image = existing?.width === 128 && existing?.height === 64 ? existing : await loadImage();
    // TextureLoader's load event can precede image decode. Never begin a
    // close step until the same real idle frame is available for every draw.
    if (image.decode) await image.decode();
    const T = window.THREE, canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    const texture = new T.CanvasTexture(canvas);
    texture.encoding = T.sRGBEncoding;
    texture.magFilter = texture.minFilter = T.NearestFilter;
    texture.generateMipmaps = false;
    const material = new T.MeshBasicMaterial({ map: texture, toneMapped: false, side: original.side });
    material.name = 'Dash idle OLED';
    screen.material = material;
    // Source CAD has a dark inactive surface; the prepared hero already
    // includes this small offset in front of the display cover.
    if (!original.map) screen.position.z += .055;
    let active = false, disposed = false, timer = 0, step = -1, version = 0, pending = 0, cycles = 0;
    const amounts = [.5, .08, .5, 1], holds = [35, 90, 45];
    const state = value => {
      if (!diagnostics) return;
      diagnostics.dataset.dashBlinkState = value;
      diagnostics.dataset.dashBlinkCycles = String(cycles);
      diagnostics.dataset.dashBlinkFrames = String(version);
    };
    const cancel = () => { if (timer) clearTimeout(timer); timer = 0; };
    const paint = amount => {
      context.fillStyle = '#03090b'; context.fillRect(0, 0, 128, 64);
      context.drawImage(image, 0, 32 * (1 - amount), 128, 64 * amount);
      texture.needsUpdate = true;
      version++;
    };
    const stop = () => {
      cancel(); active = false; pending = 0;
      if (step >= 0 && step < amounts.length - 1) paint(1);
      step = -1; state('paused');
    };
    const permitted = () => active && !disposed && allowed();
    const later = (callback, delay) => {
      cancel();
      timer = setTimeout(() => {
        timer = 0;
        if (!permitted()) { stop(); return; }
        callback();
      }, delay);
    };
    const sleep = () => {
      state('idle');
      // Slightly varied, infrequent pauses, with no RAF between blinks.
      later(() => { step = 0; advance(); }, [5200, 6800, 5900][cycles % 3]);
    };
    const advance = () => {
      paint(amounts[step]); pending = version;
      state(step === 0 ? 'closing' : step === 1 ? 'closed' : step === 2 ? 'opening' : 'open');
      invalidate?.();
    };
    paint(1); state('paused');
    return {
      get version() { return version; },
      setActive(value) {
        const next = !!value && !disposed && allowed();
        if (next === active) return;
        if (!next) { stop(); return; }
        active = true; sleep();
      },
      didRender(drawnVersion) {
        if (!permitted()) { if (active) stop(); return; }
        if (!pending || pending !== drawnVersion || version !== drawnVersion) return;
        pending = 0;
        // Wait for a displayed frame before timing the next step. A busy
        // hero GPU can never accumulate hidden blink frames or extra draws.
        if (step === amounts.length - 1) { cycles++; step = -1; sleep(); }
        else later(() => { step++; advance(); }, holds[step]);
      },
      dispose() {
        if (disposed) return;
        stop(); disposed = true;
        if (screen.material === material) { screen.material = original; screen.position.z = originalZ; }
        texture.dispose(); material.dispose(); state('disposed');
      }
    };
  }
  window.DashIdleBlink = { mount };
})();
