const playbackRate = 24;
const colors = { grid: '#345145', baseline: '#6d897b', muted: '#b9c9bf', track: '#658174', signal: '#ffbe6b', marker: '#ffdf9b' };

function elapsedLabel(seconds) {
  const tenths = Math.round(seconds * 10);
  const minutes = Math.floor(tenths / 600);
  const remainder = ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
  return `${String(minutes).padStart(2, '0')}:${remainder}`;
}

function signed(value) {
  const rounded = Number(value.toFixed(1));
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)}`;
}

function closestSample(samples, time) {
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (samples[mid][0] < time) low = mid + 1;
    else high = mid;
  }
  return low > 0 && time - samples[low - 1][0] < samples[low][0] - time ? low - 1 : low;
}

function sizedCanvas(canvas, context) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 72 || height < 72) return null;
  const pixels = Math.min(window.devicePixelRatio || 1, 2);
  const scaledWidth = Math.round(width * pixels);
  const scaledHeight = Math.round(height * pixels);
  if (canvas.width !== scaledWidth) canvas.width = scaledWidth;
  if (canvas.height !== scaledHeight) canvas.height = scaledHeight;
  context.setTransform(pixels, 0, 0, pixels, 0, 0);
  context.clearRect(0, 0, width, height);
  context.font = '12px "Plex Mono", "IBM Plex Mono", monospace';
  return { width, height };
}

function line(context, firstX, firstY, lastX, lastY, color) {
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.moveTo(firstX, firstY);
  context.lineTo(lastX, lastY);
  context.stroke();
}

function trace(context, samples, point, index, color, width) {
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineJoin = 'round';
  for (let step = 0; step <= index; step += 1) {
    const [x, y] = point(samples[step]);
    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
}

function marker(context, x, y) {
  context.beginPath();
  context.fillStyle = colors.marker;
  context.arc(x, y, 4, 0, Math.PI * 2);
  context.fill();
}

function trackPlot(canvas, samples) {
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.hidden = true;
    return () => {};
  }
  const east = samples.map(sample => sample[3]);
  const north = samples.map(sample => sample[4]);
  const minEast = Math.min(...east);
  const minNorth = Math.min(...north);
  const spanEast = Math.max(...east) - minEast;
  const spanNorth = Math.max(...north) - minNorth;

  return index => {
    const area = sizedCanvas(canvas, context);
    if (!area) return;
    const { width, height } = area;
    const scale = Math.min((width - 36) / spanEast, (height - 28) / spanNorth);
    const left = (width - spanEast * scale) / 2;
    const bottom = (height + spanNorth * scale) / 2;
    const point = ([, , , sampleEast, sampleNorth]) => [left + (sampleEast - minEast) * scale, bottom - (sampleNorth - minNorth) * scale];
    const spacing = 50 * scale;
    for (let x = width / 2 % spacing; x < width; x += spacing) line(context, x, 0, x, height, colors.grid);
    for (let y = height / 2 % spacing; y < height; y += spacing) line(context, 0, y, width, y, colors.grid);
    trace(context, samples, point, samples.length - 1, colors.track, 1.25);
    trace(context, samples, point, index, colors.signal, 1.9);
    marker(context, ...point(samples[index]));
    context.fillStyle = colors.muted;
    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.fillText('N ↑', 8, 7);
    context.textBaseline = 'bottom';
    context.fillText('50 m', 8, height - 10);
    line(context, 8, height - 7, 8 + spacing, height - 7, colors.muted);
  };
}

function heightPlot(canvas, samples) {
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.hidden = true;
    return () => {};
  }
  const heights = samples.map(sample => sample[1]);
  const minHeight = Math.floor(Math.min(...heights) / 25) * 25;
  const maxHeight = Math.ceil(Math.max(...heights) / 25) * 25;
  const duration = samples.at(-1)[0];

  return index => {
    const area = sizedCanvas(canvas, context);
    if (!area) return;
    const { width, height } = area;
    const left = 34;
    const right = width - 20;
    const top = 8;
    const bottom = height - 22;
    const x = time => left + time / duration * (right - left);
    const y = metres => top + (maxHeight - metres) / (maxHeight - minHeight) * (bottom - top);
    const point = ([time, metres]) => [x(time), y(metres)];
    context.fillStyle = colors.muted;
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    for (const value of [-25, 0, 50, 100]) {
      context.fillText(String(value), left - 6, y(value));
      line(context, left, y(value), right, y(value), value === 0 ? colors.baseline : colors.grid);
    }
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (const minute of [0, 2, 4, 6, 8, 10]) {
      if (width < 310 && minute !== 0 && minute % 4 !== 0) continue;
      const position = x(minute * 60);
      line(context, position, top, position, bottom, colors.grid);
      context.fillText(`${minute}:00`, position, bottom + 6);
    }
    trace(context, samples, point, samples.length - 1, colors.track, 1.25);
    trace(context, samples, point, index, colors.signal, 2);
    const [selectedX, selectedY] = point(samples[index]);
    line(context, selectedX, top, selectedX, bottom, colors.baseline);
    marker(context, selectedX, selectedY);
  };
}

function mountFlight(container, data) {
  const { samples } = data;
  const duration = samples.at(-1)[0];
  container.innerHTML = `
    <div class="flight-preview" aria-label="F110211 flight replay preview">
      <div class="flight-preview__plots">
        <figure>
          <figcaption>Ground track <span>GNSS</span></figcaption>
          <canvas data-flight-track aria-hidden="true"></canvas>
        </figure>
        <figure>
          <figcaption>Barometric height change <span>m</span></figcaption>
          <canvas data-flight-height aria-hidden="true"></canvas>
        </figure>
      </div>
      <dl class="flight-preview__readouts">
        <div><dt>Elapsed</dt><dd data-flight-time></dd></div>
        <div><dt>Height change</dt><dd data-flight-altitude></dd></div>
        <div><dt>Ground speed</dt><dd data-flight-speed></dd></div>
      </dl>
      <div class="flight-preview__controls">
        <button type="button" data-flight-play>Play ${playbackRate}×</button>
        <label><span>Replay position</span><input type="range" min="0" max="${samples.length - 1}" value="0" data-flight-scrub></label>
      </div>
    </div>
    <div class="flight-preview__source">
      <p>Selected samples from the published F110211 replay. Height is relative to the start of the log.</p>
      <a href="/shared/projects/skylabs/f110211/">Open full Flight Review</a>
    </div>`;

  const elapsed = container.querySelector('[data-flight-time]');
  const altitude = container.querySelector('[data-flight-altitude]');
  const speed = container.querySelector('[data-flight-speed]');
  const scrubber = container.querySelector('[data-flight-scrub]');
  const play = container.querySelector('[data-flight-play]');
  const drawTrack = trackPlot(container.querySelector('[data-flight-track]'), samples);
  const drawHeight = heightPlot(container.querySelector('[data-flight-height]'), samples);
  let current = -1;
  let request = 0;

  function paint() {
    if (current < 0) return;
    drawTrack(current);
    drawHeight(current);
  }

  function setSample(index) {
    if (index === current) return;
    current = index;
    const [time, metres, groundSpeed] = samples[index];
    elapsed.textContent = `${elapsedLabel(time)} / ${elapsedLabel(duration)}`;
    altitude.textContent = `${signed(metres)} m`;
    speed.textContent = `${groundSpeed.toFixed(1)} m/s`;
    scrubber.value = String(index);
    scrubber.setAttribute('aria-valuetext', `${elapsedLabel(time)} elapsed, ${signed(metres)} metres height change, ${groundSpeed.toFixed(1)} metres per second ground speed`);
    paint();
  }

  function pause() {
    cancelAnimationFrame(request);
    request = 0;
    play.textContent = `Play ${playbackRate}×`;
  }

  function start() {
    if (current === samples.length - 1) setSample(0);
    const startTime = performance.now();
    const startElapsed = samples[current][0];
    play.textContent = 'Pause';
    function tick(now) {
      const time = Math.min(duration, startElapsed + (now - startTime) / 1000 * playbackRate);
      setSample(closestSample(samples, time));
      if (time >= duration) pause();
      else request = requestAnimationFrame(tick);
    }
    request = requestAnimationFrame(tick);
  }

  play.addEventListener('click', () => request ? pause() : start());
  scrubber.addEventListener('input', () => {
    pause();
    setSample(Number(scrubber.value));
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  if ('ResizeObserver' in window) {
    const resize = new ResizeObserver(paint);
    resize.observe(container);
  } else window.addEventListener('resize', paint);
  setSample(0);
}

async function loadFlight(container) {
  const fallback = [...container.childNodes];
  try {
    const response = await fetch(new URL('./f110211-preview.json', import.meta.url));
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data.samples) || data.samples.length < 2) return;
    if (!data.samples.every(sample => Array.isArray(sample) && sample.length === 5 && sample.every(Number.isFinite))) return;
    mountFlight(container, data);
  } catch {
    container.replaceChildren(...fallback);
  }
}

const target = document.querySelector('[data-v5-flight]');
if (target && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    loadFlight(target);
  }, { rootMargin: '240px 0px' });
  observer.observe(target);
} else if (target) loadFlight(target);
