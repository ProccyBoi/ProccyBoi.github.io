const scenarios = [
  { id: 'steady', label: 'Steady signal', type: 'steady', direction: 0 },
  { id: 'spike-high', label: 'Positive spike', type: 'spike', direction: 1 },
  { id: 'spike-low', label: 'Negative spike', type: 'spike', direction: -1 },
  { id: 'drift-high', label: 'Upward drift', type: 'drift', direction: 1 },
  { id: 'drift-low', label: 'Downward drift', type: 'drift', direction: -1 },
];

const indicators = [
  { id: 'spike-high', ref: 'D9', label: 'Spike High' },
  { id: 'spike-low', ref: 'D8', label: 'Spike Low' },
  { id: 'drift-high', ref: 'D7', label: 'Drift High' },
  { id: 'drift-low', ref: 'D6', label: 'Drift Low' },
];

const captureSeconds = 3;
const samplesPerSecond = 160;
const driftCutoffHz = 1;
const driftLimitMv = 45;
const indicatorLabels = new Map(indicators.map(({ id, label }) => [id, label]));

function capture(scenario, spikeLimitMv) {
  const samples = [];
  const trips = new Set();
  const smoothing = 1 - Math.exp(-2 * Math.PI * driftCutoffHz / samplesPerSecond);
  let drift = 0;

  for (let index = 0; index <= captureSeconds * samplesPerSecond; index += 1) {
    const time = index / samplesPerSecond;
    const ripple = 5 * Math.sin(time * Math.PI * 6) + 2 * Math.sin(time * Math.PI * 28);
    let excursion = 0;

    if (scenario.type === 'spike') {
      const position = (time - 1.16) / 0.029;
      excursion = scenario.direction * 118 * Math.exp(-0.5 * position ** 2);
    }
    if (scenario.type === 'drift') {
      const rise = 1 / (1 + Math.exp(-12 * (time - 0.95)));
      const decay = 1 / (1 + Math.exp(-12 * (time - 2.2)));
      excursion = scenario.direction * 63 * (rise - decay);
    }

    const signal = ripple + excursion;
    drift += (signal - drift) * smoothing;
    if (signal > spikeLimitMv) trips.add('spike-high');
    if (signal < -spikeLimitMv) trips.add('spike-low');
    if (drift > driftLimitMv) trips.add('drift-high');
    if (drift < -driftLimitMv) trips.add('drift-low');
    samples.push({ signal, drift });
  }

  return { samples, trips, spikeLimitMv };
}

function createScope(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.hidden = true;
    return () => {};
  }

  function line(x1, y1, x2, y2, color, dash = []) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(dash);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  return ({ samples, spikeLimitMv }, cursor) => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 64 || height < 64) return;

    const density = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * density);
    const pixelHeight = Math.round(height * density);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    ctx.setTransform(density, 0, 0, density, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const left = 38;
    const top = 14;
    const right = width - 22;
    const bottom = height - 24;
    const x = (fraction) => left + fraction * (right - left);
    const y = (mv) => top + (180 - mv) / 360 * (bottom - top);

    ctx.font = '12px "IBM Plex Mono", Consolas, monospace';
    ctx.fillStyle = '#adb8ae';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const mv of [150, 75, 0, -75, -150]) {
      const label = mv > 0 ? `+${mv}` : `${mv}`;
      ctx.fillText(label, left - 7, y(mv));
      line(left, y(mv), right, y(mv), mv ? '#29372f' : '#465c50');
    }

    ctx.textAlign = 'center';
    for (let time = 0; time <= captureSeconds; time += 0.5) {
      const px = x(time / captureSeconds);
      line(px, top, px, bottom, time % 1 ? '#253129' : '#35453b');
      if (time % 1 === 0) ctx.fillText(`${time} s`, px, bottom + 12);
    }
    line(left, y(spikeLimitMv), right, y(spikeLimitMv), '#e58c7d', [5, 5]);
    line(left, y(-spikeLimitMv), right, y(-spikeLimitMv), '#e58c7d', [5, 5]);

    for (const [key, color, strokeWidth] of [['drift', '#e7b47b', 1.5], ['signal', '#a7deab', 2]]) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = 'round';
      samples.forEach((sample, index) => {
        const px = x(index / (samples.length - 1));
        const py = y(sample[key]);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    if (cursor !== null) {
      const px = x(cursor);
      line(px, top, px, bottom, '#adb8ae');
    }
  };
}

export function mountDemo(container) {
  container.classList.add('glitch-demo');
  container.innerHTML = `
    <figure class="glitch-demo__scope">
      <figcaption class="glitch-demo__scope-label">Scope <span>Deviation in mV</span></figcaption>
      <canvas class="glitch-demo__canvas" role="img" aria-label="Steady signal with its low-pass drift trace"></canvas>
      <ul class="glitch-demo__legend" aria-label="Scope legend">
        <li data-trace="signal">Input deviation</li>
        <li data-trace="drift">Filtered drift</li>
        <li data-trace="limit">Spike threshold</li>
      </ul>
    </figure>
    <div class="glitch-demo__controls">
      <label class="glitch-demo__field">
        Signal
        <span class="glitch-demo__select">
          <select data-scenario>
            ${scenarios.map(({ id, label }) => `<option value="${id}">${label}</option>`).join('')}
          </select>
        </span>
      </label>
      <fieldset class="glitch-demo__threshold">
        <legend>Spike threshold</legend>
        <div class="glitch-demo__segments" aria-label="Spike threshold options">
          <button type="button" aria-pressed="true" data-threshold="75">±75 mV</button>
          <button type="button" aria-pressed="false" data-threshold="150">±150 mV</button>
        </div>
      </fieldset>
      <div class="glitch-demo__actions">
        <button type="button" class="glitch-demo__run" data-run>Run signal</button>
        <button type="button" data-reset>Arm / Reset</button>
      </div>
    </div>
    <div class="glitch-demo__readout">
      <p class="glitch-demo__result" role="status" data-result>Armed. Choose a signal and run a capture.</p>
      <ul class="glitch-demo__indicators" aria-label="Latched fault indicators">
        ${indicators.map(({ id, ref, label }) => `
          <li data-indicator="${id}">
            <span class="glitch-demo__lamp" aria-hidden="true"></span>
            <span>${label} <small>· ${ref}</small></span>
            <span class="glitch-demo__indicator-state">Clear</span>
          </li>
        `).join('')}
      </ul>
      <p class="glitch-demo__note">Illustrative signals show how the spike and drift paths set separate fault latches. The drift path uses an approximately 1 Hz filter and a demo threshold of ±45 mV.</p>
    </div>`;

  const latched = new Set();
  const canvas = container.querySelector('canvas');
  const select = container.querySelector('[data-scenario]');
  const thresholdButtons = container.querySelectorAll('[data-threshold]');
  const indicatorRows = container.querySelectorAll('[data-indicator]');
  const result = container.querySelector('[data-result]');
  const draw = createScope(canvas);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let spikeLimit = 75;
  let waveform = capture(scenarios[0], spikeLimit);
  let frame = 0;
  let cursor = null;

  const redraw = () => draw(waveform, cursor);
  const resize = new ResizeObserver(redraw);
  resize.observe(canvas);
  redraw();

  function showIndicators() {
    for (const row of indicatorRows) {
      const tripped = latched.has(row.dataset.indicator);
      row.toggleAttribute('data-latched', tripped);
      row.querySelector('.glitch-demo__indicator-state').textContent = tripped ? 'Latched' : 'Clear';
    }
  }

  function stopSweep() {
    cancelAnimationFrame(frame);
    frame = 0;
    cursor = null;
  }

  for (const button of thresholdButtons) {
    button.addEventListener('click', () => {
      spikeLimit = Number(button.dataset.threshold);
      for (const option of thresholdButtons) option.setAttribute('aria-pressed', String(option === button));
      waveform = { ...waveform, spikeLimitMv: spikeLimit };
      redraw();
      result.textContent = `Spike threshold set to ±${spikeLimit} mV. Run a signal to test it.`;
    });
  }

  container.querySelector('[data-run]').addEventListener('click', () => {
    const scenario = scenarios.find(({ id }) => id === select.value);
    stopSweep();
    waveform = capture(scenario, spikeLimit);
    for (const trip of waveform.trips) latched.add(trip);
    showIndicators();

    const trips = [...waveform.trips].map((id) => indicatorLabels.get(id));
    const outcome = trips.length ? `${trips.join(' and ')} latched.` : 'No new fault detected.';
    result.textContent = `${scenario.label}. ${outcome}`;
    canvas.setAttribute('aria-label', `Scope plot for ${scenario.label.toLowerCase()}. ${outcome}`);
    redraw();

    if (!reduceMotion.matches) {
      const start = performance.now();
      const sweep = (now) => {
        const elapsed = (now - start) / 1000;
        cursor = elapsed < 1.25 ? Math.max(0, elapsed / 1.25) : null;
        redraw();
        frame = cursor === null ? 0 : requestAnimationFrame(sweep);
      };
      frame = requestAnimationFrame(sweep);
    }
  });

  container.querySelector('[data-reset]').addEventListener('click', () => {
    stopSweep();
    latched.clear();
    showIndicators();
    redraw();
    result.textContent = 'Rearmed. All fault latches cleared.';
  });
}
