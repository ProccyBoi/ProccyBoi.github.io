const indicators = [
  { id: 'spike-high', live: 'D9', latched: 'D13', label: 'Spike High' },
  { id: 'spike-low', live: 'D8', latched: 'D14', label: 'Spike Low' },
  { id: 'drift-high', live: 'D7', latched: 'D15', label: 'Drift High' },
  { id: 'drift-low', live: 'D6', latched: 'D16', label: 'Drift Low' },
];

const signals = [
  { id: 'steady', label: 'Steady input' },
  { id: 'spike-high', label: 'Positive spike', duration: 520, spike: true },
  { id: 'spike-low', label: 'Negative spike', duration: 520, spike: true },
  { id: 'drift-high', label: 'Upward drift', duration: 1500 },
  { id: 'drift-low', label: 'Downward drift', duration: 1500 },
];

const controls = [
  { action: 'power', ref: 'J5', label: 'Demo power' },
  { action: 'input', ref: 'J1 / J2', label: 'Test leads' },
  { action: 'reset', ref: 'SW2', label: 'Arm / Reset' },
  { action: 'threshold', ref: 'SW3', label: 'Spike threshold' },
  { action: 'mute', ref: 'SW4', label: 'Buzzer mute' },
];

function benchMarkup() {
  return `
    <div class="glitch-demo__stage">
      <div class="glitch-demo__fallback" data-bench-fallback>
        <div class="glitch-demo__poster">
          <img width="1600" height="1200" alt="Isolated Glitch Tester circuit board with its switches and indicators">
          <span data-bench-post-port="power" aria-hidden="true" hidden></span>
          <span data-bench-post-port="positive" aria-hidden="true" hidden></span>
          <span data-bench-post-port="negative" aria-hidden="true" hidden></span>
          ${indicators.map(({ id, live, latched }) => `
            <span class="glitch-demo__poster-led" data-fault="${id}" data-bench-post-led="${live}" aria-hidden="true" hidden></span>
            <span class="glitch-demo__poster-led" data-fault="${id}" data-bench-post-led="${latched}" aria-hidden="true" hidden></span>
          `).join('')}
        </div>
        <p data-bench-fallback-note role="status"></p>
      </div>
      <div class="glitch-demo__model" data-bench-model aria-label="Interactive 3D board" hidden></div>
    </div>
    <div class="glitch-demo__controls">
      <p class="glitch-demo__result" role="status" data-bench-result></p>
      <fieldset class="glitch-demo__switches" data-bench-switches>
        <legend>Connections and switches</legend>
        ${controls.map(({ action, ref, label }) => `
          <button type="button" data-bench-action="${action}" aria-label="${label}" ${action === 'threshold' ? '' : 'aria-pressed="false"'}>
            <span>${label} <small>${ref}</small></span><span data-bench-control-state></span>
          </button>
        `).join('')}
      </fieldset>
      <fieldset class="glitch-demo__events" data-bench-signals disabled>
        <legend>Test input</legend>
        <div>
          ${signals.map(({ id, label }) => `<button type="button" data-bench-signal="${id}">${label}</button>`).join('')}
        </div>
      </fieldset>
    </div>
    <div class="glitch-demo__readout">
      <ul class="glitch-demo__indicators" aria-label="Board fault LEDs">
        ${indicators.map(({ id, live, latched, label }) => `
          <li data-fault="${id}" data-bench-live-led="${live}" data-bench-led="${latched}">
            <span class="glitch-demo__lamp" aria-hidden="true"></span>
            <span>${label}</span>
            <span class="glitch-demo__indicator-detail">
              <span data-bench-live-state>Live off</span> <small>· ${live}</small><br>
              <span data-bench-led-state>Latch off</span> <small>· ${latched}</small>
            </span>
          </li>
        `).join('')}
      </ul>
      <p class="glitch-demo__note"><strong>Optional buzzer</strong> <span data-bench-buzzer>Off</span></p>
      <p class="glitch-demo__note">The virtual board has the optional latch LEDs fitted. Signal timing and LED colors are illustrative.</p>
    </div>`;
}

export async function mountDemo(container, { board, assetBase, poster, mountScene } = {}) {
  container.classList.add('glitch-demo');
  container.innerHTML = benchMarkup();

  const fallback = container.querySelector('[data-bench-fallback]');
  const fallbackNote = container.querySelector('[data-bench-fallback-note]');
  const fallbackImage = fallback.querySelector('img');
  const model = container.querySelector('[data-bench-model]');
  const result = container.querySelector('[data-bench-result]');
  const inputControls = container.querySelector('[data-bench-signals]');
  const switchControls = container.querySelector('[data-bench-switches]');
  const buzzer = container.querySelector('[data-bench-buzzer]');
  const controlButtons = container.querySelectorAll('[data-bench-action]');
  const signalButtons = container.querySelectorAll('[data-bench-signal]');
  const ledRows = container.querySelectorAll('[data-bench-led]');
  const posterPorts = container.querySelectorAll('[data-bench-post-port]');
  const posterLeds = container.querySelectorAll('[data-bench-post-led]');
  if (poster) fallbackImage.src = poster;
  else fallbackImage.hidden = true;

  const compactBench = window.matchMedia('(max-width: 760px)');
  function orderControls() {
    const active = document.activeElement;
    if (compactBench.matches) switchControls.before(inputControls);
    else switchControls.after(inputControls);
    if (inputControls.contains(active)) active.focus({ preventScroll: true });
  }
  compactBench.addEventListener('change', orderControls);
  orderControls();

  const state = {
    powered: false,
    inputConnected: false,
    armed: false,
    threshold: 75,
    buzzerMuted: false,
    signal: 'steady',
  };
  const latched = new Set();
  let activeIndicator = null;
  let eventTimer = null;
  let scene = null;

  function nextAction() {
    if (!state.powered) return 'power';
    if (!state.inputConnected) return 'input';
    if (!state.armed) return 'reset';
    return '';
  }

  function guidance() {
    return {
      power: 'Connect demo power at J5.',
      input: 'Connect the test leads at J1 and J2.',
      reset: 'Flip Arm / Reset to keep fault LEDs on after a test.',
      '': 'The tester is armed. Choose a test input.',
    }[nextAction()];
  }

  function publishSceneState() {
    scene?.update({ ...state, live: activeIndicator ? [activeIndicator.live] : [], latched: [...latched] });
  }

  function refresh(message) {
    const next = nextAction();
    const settings = {
      power: [state.powered ? 'Connected' : 'Connect', state.powered],
      input: [state.inputConnected ? 'Connected' : 'Connect', state.inputConnected],
      reset: [state.armed ? 'Armed' : 'Reset', state.armed],
      threshold: [`±${state.threshold} mV`],
      mute: [state.buzzerMuted ? 'Muted' : 'Enabled', state.buzzerMuted],
    };

    for (const button of controlButtons) {
      const action = button.dataset.benchAction;
      const [label, pressed] = settings[action];
      button.querySelector('[data-bench-control-state]').textContent = label;
      button.toggleAttribute('data-bench-next', action === next);
      if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
      else button.setAttribute('aria-label', `Spike threshold ${label}. Switch to ±${state.threshold === 75 ? 150 : 75} mV.`);
    }

    inputControls.disabled = !state.powered || !state.inputConnected;
    for (const row of ledRows) {
      const lit = latched.has(row.dataset.benchLed);
      const live = activeIndicator?.live === row.dataset.benchLiveLed;
      row.toggleAttribute('data-latched', lit);
      row.toggleAttribute('data-live', live);
      row.querySelector('[data-bench-live-state]').textContent = live ? 'Live on' : 'Live off';
      row.querySelector('[data-bench-led-state]').textContent = lit ? 'Latched' : 'Latch off';
    }

    for (const mark of posterPorts) {
      mark.hidden = !poster || (mark.dataset.benchPostPort === 'power' ? !state.powered : !state.inputConnected);
    }
    for (const mark of posterLeds) {
      mark.hidden = !poster || (activeIndicator?.live !== mark.dataset.benchPostLed && !latched.has(mark.dataset.benchPostLed));
    }

    buzzer.textContent = state.powered ? (state.buzzerMuted ? 'Muted' : (latched.size ? 'Alert' : 'Ready')) : 'Off';
    if (message) result.textContent = message;
    publishSceneState();
  }

  function clearInputEvent() {
    clearTimeout(eventTimer);
    eventTimer = null;
    activeIndicator = null;
    state.signal = 'steady';
  }

  const actions = {
    power() {
      state.powered = !state.powered;
      if (state.powered) return guidance();
      latched.clear();
      clearInputEvent();
      return 'Demo power disconnected. The fault LEDs are off.';
    },
    input() {
      state.inputConnected = !state.inputConnected;
      if (state.inputConnected) return guidance();
      clearInputEvent();
      return latched.size ? 'Test leads disconnected. The latched LEDs stay on.' : 'Test leads disconnected.';
    },
    reset() {
      state.armed = !state.armed;
      if (state.armed) {
        if (activeIndicator) {
          latched.add(activeIndicator.latched);
          return `${activeIndicator.label} latched. The LED stays on until reset.`;
        }
        return guidance();
      }
      latched.clear();
      return 'Reset cleared the fault LEDs. Flip Arm / Reset again to rearm.';
    },
    threshold() {
      state.threshold = state.threshold === 75 ? 150 : 75;
      if (state.threshold === 150 && state.signal.startsWith('spike-')) clearInputEvent();
      return `Spike threshold set to ±${state.threshold} mV.`;
    },
    mute() {
      state.buzzerMuted = !state.buzzerMuted;
      return state.buzzerMuted ? 'The optional buzzer is muted.' : 'The optional buzzer is enabled.';
    },
  };

  function onAction(action) {
    if (Object.hasOwn(actions, action)) refresh(actions[action]());
  }

  for (const button of controlButtons) {
    button.addEventListener('click', () => onAction(button.dataset.benchAction));
  }

  for (const button of signalButtons) {
    button.addEventListener('click', () => {
      if (inputControls.disabled) return;
      const signal = signals.find(({ id }) => id === button.dataset.benchSignal);
      clearInputEvent();
      state.signal = signal.id;
      if (!signal.duration) {
        refresh(latched.size ? 'Steady input applied. The latched LEDs stay on.' : 'Steady input applied. The fault LEDs stay clear.');
        return;
      }
      eventTimer = setTimeout(() => {
        clearInputEvent();
        refresh();
      }, signal.duration);
      if (signal.spike && state.threshold === 150) {
        refresh('This demo spike stays below the ±150 mV threshold.');
      } else {
        activeIndicator = indicators.find(({ id }) => id === signal.id);
        if (state.armed) {
          latched.add(activeIndicator.latched);
          refresh(`${activeIndicator.label} latched. The LED stays on until reset.`);
        } else {
          refresh(`${activeIndicator.label} detected. Reset is holding the latch clear.`);
        }
      }
    });
  }

  refresh(guidance());
  if (board && mountScene) {
    fallbackNote.textContent = 'Loading the 3D board…';
    // The model stage must be measurable while the poster is visible.
    model.hidden = false;
    model.style.visibility = 'hidden';
    try {
      scene = await mountScene(model, { board, assetBase, poster, onAction });
      if (scene) {
        publishSceneState();
        model.style.removeProperty('visibility');
        fallback.hidden = true;
        return;
      }
    } catch (error) {
      console.warn('The tester’s interactive 3D board is unavailable.', error);
    }
    scene?.dispose();
    scene = null;
    model.hidden = true;
  }
  fallbackNote.textContent = '3D is unavailable. Use the bench controls to try the board.';
}
