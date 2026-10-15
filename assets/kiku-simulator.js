/* The pixels come from Kiku's unmodified C renderer compiled to WebAssembly.
 * Only the input/peripheral model is a browser fixture; this emits no audio. */
const LOOKS = ['Kiku', 'Polaroid', 'Walkman', 'Instrument', 'MiniDisc', 'Terminal', 'Aqua', 'Paper', 'Studio', 'Amber'];
let compiledModule;
let sequence = 0;

async function loadRenderer() {
  if (!compiledModule) {
    compiledModule = fetch(new URL('./kiku/firmware-ui.wasm', import.meta.url))
      .then(response => {
        if (!response.ok) throw new Error(`Renderer download failed (${response.status})`);
        return response.arrayBuffer();
      }).then(bytes => WebAssembly.compile(bytes))
      .catch(error => { compiledModule = undefined; throw error; });
  }
  return WebAssembly.instantiate(await compiledModule);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Mount one independent firmware-display demo into an empty HTML element.
 * Returns {destroy(), reset()} after loading. No storage, Bluetooth, audio,
 * timers, telemetry or external service is used. Styles are page-owned. */
export async function mountKikuSimulator(container) {
  if (!(container instanceof HTMLElement)) throw new TypeError('A simulator container is required.');
  if (container.dataset.kikuMounted) return;
  container.dataset.kikuMounted = 'loading';
  const loading = element('p', 'kiku-sim-loading', 'Loading the firmware display…');
  loading.setAttribute('role', 'status');
  container.append(loading);
  try {
    const instance = await loadRenderer();
    if (!loading.isConnected) return;
    const api = instance.exports;
    api.sim_init();
    const decoder = new TextDecoder();
    const readText = field => {
      const address = api.sim_text(field);
      const bytes = new Uint8Array(api.memory.buffer);
      let end = address;
      while (end < bytes.length && bytes[end]) ++end;
      return decoder.decode(bytes.subarray(address, end));
    };
    const id = `kiku-sim-${++sequence}`;
    const root = element('div', 'kiku-sim');
    const toolbar = element('div', 'kiku-sim-toolbar');
    const lookLabel = element('label', 'kiku-sim-field', 'Look');
    const look = element('select', 'kiku-sim-look');
    look.setAttribute('aria-label', 'Look');
    for (const [index, name] of LOOKS.entries()) {
      const option = element('option', '', name); option.value = String(index); look.append(option);
    }
    lookLabel.append(look);
    const phoneLabel = element('label', 'kiku-sim-field kiku-sim-phone-label');
    const phone = element('input', 'kiku-sim-phone'); phone.type = 'checkbox';
    phoneLabel.append(phone, document.createTextNode('Demo phone connected'));
    const reset = element('button', 'kiku-sim-reset', 'Reset demo'); reset.type = 'button';
    toolbar.append(lookLabel, phoneLabel, reset);
    const display = element('div', 'kiku-sim-display');
    const canvas = element('canvas', 'kiku-sim-canvas');
    canvas.width = 320; canvas.height = 240; canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-describedby', `${id}-keys`);
    canvas.textContent = 'The same controls and display state are described below.';
    const context = canvas.getContext('2d', {alpha: false});
    if (!context) throw new Error('Canvas is unavailable.');
    const frame = context.createImageData(320, 240);
    display.append(canvas);
    const controls = element('div', 'kiku-sim-controls');
    controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Kiku physical controls');
    const state = element('p', 'kiku-sim-state');
    state.setAttribute('role', 'status'); state.setAttribute('aria-live', 'polite'); state.setAttribute('aria-atomic', 'true');
    const hint = element('p', 'kiku-sim-hint');
    const notice = element('p', 'kiku-sim-notice');
    const note = element('p', 'kiku-sim-note', 'Live firmware renderer · simulated inputs and sample data · no audio or hardware connection.');
    const keyboard = element('p', 'kiku-sim-keyboard', 'Focus the display: ← / → rotate, Enter presses the encoder, A / D press left / right, Shift+A / Shift+D hold them, P holds the encoder. Hold buttons act immediately in this demo.');
    keyboard.id = `${id}-keys`;

    function draw() {
      const pixels = new Uint16Array(api.memory.buffer, api.sim_pixels(), 320 * 240);
      for (let index = 0; index < pixels.length; ++index) {
        const value = pixels[index]; const offset = index * 4;
        frame.data[offset] = Math.round(((value >> 11) & 31) * 255 / 31);
        frame.data[offset + 1] = Math.round(((value >> 5) & 63) * 255 / 63);
        frame.data[offset + 2] = Math.round((value & 31) * 255 / 31);
        frame.data[offset + 3] = 255;
      }
      context.putImageData(frame, 0, 0);
      const description = readText(0);
      state.textContent = description;
      canvas.setAttribute('aria-label', `${description} Keyboard control is available when focused.`);
      notice.textContent = readText(1);
      look.value = String(api.sim_value(1)); phone.checked = Boolean(api.sim_value(13));
      const screen = api.sim_value(0);
      const connected = Boolean(api.sim_value(9));
      hint.textContent = api.sim_value(10) ? 'Hold encoder to power on.' :
        screen === 0 ? 'Rotate to choose a destination. Press the encoder to open it.' :
        screen === 2 || (screen === 5 && connected) ? 'Rotate for volume. Left / right change tracks. Press to play or pause. Hold left for Home.' :
        screen === 4 ? 'Rotate to tune or change volume. Press to switch modes. Left / right seek. Hold left for Home.' :
        screen === 5 ? 'Press left for Home. Hold right to request pairing; use Demo phone to simulate the connection.' :
        screen === 6 ? 'Rotate to apply the output route. Press left for Home.' :
        screen === 7 ? 'Rotate to select. Press to change or open. Press left for Home.' :
        'Press left to return to Settings.';
      root.dataset.screen = String(screen); root.dataset.look = LOOKS[api.sim_value(1)].toLowerCase();
    }
    function act(action, delta = 0) { api.sim_event(action, delta); draw(); }
    function button(label, action, delta, extraClass = '') {
      const node = element('button', `kiku-sim-button ${extraClass}`.trim(), label);
      node.type = 'button'; node.addEventListener('click', () => act(action, delta));
      return node;
    }
    const left = element('div', 'kiku-sim-side');
    left.append(button('Left', 3, 0), button('Hold left', 5, 0, 'kiku-sim-hold'));
    const encoder = element('div', 'kiku-sim-encoder');
    const turn = element('div', 'kiku-sim-turn');
    const anticlockwise = button('−', 0, -1); anticlockwise.setAttribute('aria-label', 'Rotate encoder anticlockwise');
    const press = button('Press', 1, 0, 'kiku-sim-press'); press.setAttribute('aria-label', 'Press encoder');
    const clockwise = button('+', 0, 1); clockwise.setAttribute('aria-label', 'Rotate encoder clockwise');
    turn.append(anticlockwise, press, clockwise);
    encoder.append(turn, button('Hold encoder · power', 2, 0, 'kiku-sim-hold'));
    const right = element('div', 'kiku-sim-side');
    right.append(button('Right', 4, 0), button('Hold right', 6, 0, 'kiku-sim-hold'));
    controls.append(left, encoder, right);
    look.addEventListener('change', () => { api.sim_theme(Number(look.value)); draw(); });
    phone.addEventListener('change', () => { api.sim_phone(phone.checked ? 1 : 0); draw(); });
    const resetDemo = () => { api.sim_init(); draw(); };
    reset.addEventListener('click', resetDemo);
    canvas.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key.toLowerCase(); let action, delta = 0;
      if (key === 'arrowleft' || key === 'arrowdown') { action = 0; delta = -1; }
      else if (key === 'arrowright' || key === 'arrowup') { action = 0; delta = 1; }
      else if (key === 'enter' || key === ' ') action = 1;
      else if (key === 'a') action = event.shiftKey ? 5 : 3;
      else if (key === 'd') action = event.shiftKey ? 6 : 4;
      else if (key === 'p') action = 2;
      else return;
      event.preventDefault();
      if (!event.repeat || action === 0) act(action, delta);
    });
    const device = element('div', 'kiku-sim-device');
    device.append(display, controls);
    const guidance = element('div', 'kiku-sim-guidance');
    guidance.append(element('p', 'kiku-sim-eyebrow', 'Interface simulator'),
      element('h3', 'kiku-sim-guidance-title', 'Make yourself at home.'),
      state, hint, notice, keyboard, note);
    root.append(toolbar, device, guidance);
    loading.replaceWith(root); container.dataset.kikuMounted = 'ready'; draw();
    return {reset: resetDemo, destroy() { root.remove(); delete container.dataset.kikuMounted; }};
  } catch (error) {
    loading.textContent = 'The interactive display could not load. The engineering case study remains available below.';
    container.dataset.kikuMounted = 'error';
    return {error, destroy() { loading.remove(); delete container.dataset.kikuMounted; }};
  }
}
