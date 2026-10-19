/* Original, locally hosted demo music. This does not run Kiku's DSP, decode an
 * SD card, receive FM or access Bluetooth. See kiku/audio/README.md. */
export const DEMO_TRACKS = Object.freeze([
  {title: 'Afterglow', file: 'afterglow', bpm: 94},
  {title: 'Paper Satellites', file: 'paper-satellites', bpm: 108},
  {title: 'Coastal Lines', file: 'coastal-lines', bpm: 100},
  {title: 'Night Bus Home', file: 'night-bus-home', bpm: 82},
]);
let activePlayer;

/** A single lazy AudioContext; no sound, downloads or context before play().
 * play() must be called directly from a user gesture, before any awaited work.
 * Every async start is versioned, so Pause/reset/new track always wins. */
export class KikuDemoAudio {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.context = null; this.gain = null; this.source = null;
    this.track = 0; this.offset = 0; this.startedAt = 0;
    this.volume = .48; this.muted = false; this.desired = false;
    this.status = 'idle'; this.reason = ''; this.version = 0; this.destroyed = false;
    this.buffers = new Map(); this.abort = new AbortController();
  }
  emit() { if (!this.destroyed) this.onChange(this); }
  setLevel(volume, muted) {
    this.volume = Math.max(0, Math.min(1, volume)); this.muted = Boolean(muted);
    if (this.gain) {
      const now = this.context.currentTime;
      const current = this.gain.gain.value;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(current, now);
      this.gain.gain.linearRampToValueAtTime(this.muted ? 0 : this.volume, now + .025);
    }
  }
  async load(index) {
    if (!this.buffers.has(index)) {
      const url = new URL(`/assets/kiku/audio/${DEMO_TRACKS[index].file}.mp3`, import.meta.url);
      const pending = fetch(url, {signal: this.abort.signal}).then(response => {
        if (!response.ok) throw new Error(`Demo audio download failed (${response.status})`);
        return response.arrayBuffer();
      }).then(bytes => this.context.decodeAudioData(bytes));
      this.buffers.set(index, pending);
      pending.catch(() => { if (this.buffers.get(index) === pending) this.buffers.delete(index); });
    }
    return this.buffers.get(index);
  }
  stopSource(keepPosition = true) {
    if (!this.source) return;
    const {node, envelope, duration} = this.source;
    const now = this.context.currentTime;
    if (keepPosition) this.offset = (this.offset + Math.max(0, now - this.startedAt)) % duration;
    // A very short release avoids discontinuities on mute, pause and track changes.
    envelope.gain.cancelScheduledValues(now);
    envelope.gain.setTargetAtTime(0, now, .006);
    node.stop(now + .035);
    node.onended = () => { node.disconnect(); envelope.disconnect(); };
    this.source = null;
  }
  play(index = this.track) {
    if (this.destroyed) return;
    index = Math.max(0, Math.min(DEMO_TRACKS.length - 1, index));
    if (this.desired && this.track === index && (this.status === 'loading' || this.status === 'playing')) return;
    if (activePlayer && activePlayer !== this) activePlayer.pause('another-demo');
    activePlayer = this;
    const changed = index !== this.track;
    this.stopSource(!changed);
    if (changed) this.offset = 0;
    this.track = index; this.desired = true; this.status = 'loading'; this.reason = '';
    const version = ++this.version;
    let resumed;
    try {
      if (!this.context || this.context.state === 'closed') {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) throw new Error('Web Audio is unavailable');
        this.context = new Context();
        this.gain = this.context.createGain(); this.gain.connect(this.context.destination);
        this.gain.gain.value = this.muted ? 0 : this.volume;
        this.context.onstatechange = () => {
          if (this.desired && this.status === 'playing' && this.context.state !== 'running') this.pause('interrupted');
        };
      }
      // Safari requires this invocation in the original click/keydown task.
      resumed = this.context.resume();
    } catch (error) { this.fail(version); return; }
    this.emit();
    Promise.all([resumed, this.load(index)]).then(([, buffer]) => {
      if (version !== this.version || !this.desired || this.destroyed) return;
      if (this.context.state !== 'running') { this.pause('interrupted'); return; }
      const node = this.context.createBufferSource(), envelope = this.context.createGain();
      node.buffer = buffer; node.loop = true; node.loopStart = 0; node.loopEnd = buffer.duration;
      node.connect(envelope); envelope.connect(this.gain);
      const now = this.context.currentTime;
      envelope.gain.setValueAtTime(0, now); envelope.gain.linearRampToValueAtTime(1, now + .035);
      this.offset %= buffer.duration; this.startedAt = now;
      this.source = {node, envelope, duration: buffer.duration};
      node.start(now, this.offset);
      this.status = 'playing'; this.emit();
    }).catch(() => this.fail(version));
  }
  fail(version) {
    if (version !== this.version || this.destroyed) return;
    this.desired = false; this.status = 'error'; this.reason = 'unavailable'; this.emit();
  }
  pause(reason = 'paused') {
    ++this.version; this.desired = false; this.stopSource();
    this.status = 'paused'; this.reason = reason;
    if (activePlayer === this) activePlayer = null;
    this.emit();
  }
  reset() {
    this.pause('reset'); this.track = 0; this.offset = 0;
    this.status = 'idle'; this.reason = ''; this.emit();
  }
  destroy() {
    this.pause('destroyed'); this.destroyed = true; this.abort.abort();
    this.buffers.clear();
    if (this.context) {
      this.context.onstatechange = null;
      if (this.context.state !== 'closed') this.context.close().catch(() => {});
    }
  }
}
