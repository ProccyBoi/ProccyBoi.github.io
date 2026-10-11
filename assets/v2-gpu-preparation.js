/* Finite, cancelable preparation fence for an existing WebGL2 renderer.
 * A completed fence covers this context's earlier commands only. It does not
 * certify another renderer, browser compositing, or a frame reaching a display.
 * Never blocks on gl.finish or a nonzero clientWaitSync timeout. */
(() => {
  'use strict';
  const POLL_MS = 16, DEFAULT_TIMEOUT_MS = 12000;
  function wait(renderer, {signal, valid, timeoutMs = DEFAULT_TIMEOUT_MS, pollMs = POLL_MS} = {}) {
    const started = performance.now();
    const requested = Number(timeoutMs);
    const duration = Number.isFinite(requested) ? Math.max(0, requested) : DEFAULT_TIMEOUT_MS;
    const requestedPoll = Number(pollMs);
    const cadence = Math.min(POLL_MS, Math.max(4, Number.isFinite(requestedPoll) ? requestedPoll : POLL_MS));
    return new Promise(resolve => {
      let gl, sync = null, timer = null, settled = false, listening = false, polls = 0;
      const current = () => {
        try {
          if (signal?.aborted) return false;
          const allowed = !valid || Boolean(valid());
          return allowed && !signal?.aborted;
        }
        catch (_) { return false; }
      };
      const cleanup = () => {
        if (timer !== null) { clearTimeout(timer); timer = null; }
        if (listening) { signal.removeEventListener('abort', abort); listening = false; }
        if (sync !== null) {
          const owned = sync; sync = null;
          // Release ownership first, including when context loss makes cleanup
          // throw. Every allocated sync gets at most one delete attempt.
          try { gl.deleteSync(owned); } catch (_) {}
        }
      };
      const finish = state => {
        if (settled) { cleanup(); return; }
        settled = true; cleanup();
        resolve({state, waitMs:Math.max(0, performance.now() - started), polls});
      };
      const abort = () => finish('canceled');
      const lost = () => {
        try { return Boolean(gl.isContextLost?.()); }
        catch (_) { return true; }
      };
      function poll() {
        timer = null;
        if (settled) return;
        if (!current()) { finish('canceled'); return; }
        if (lost()) { finish('lost'); return; }
        const remaining = duration - (performance.now() - started);
        if (remaining <= 0) { finish('timeout'); return; }
        let status;
        try { polls++; status = gl.clientWaitSync(sync, 0, 0); }
        catch (_) { finish('lost'); return; }
        // Recheck after the call too, so an abort or invalidation never wins a
        // race with a reported completion (including reentrant test contexts).
        if (settled) return;
        if (!current()) { finish('canceled'); return; }
        if (lost()) { finish('lost'); return; }
        if (performance.now() - started >= duration) { finish('timeout'); return; }
        if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
          finish('complete'); return;
        }
        if (status === gl.WAIT_FAILED || status !== gl.TIMEOUT_EXPIRED) {
          finish('lost'); return;
        }
        timer = setTimeout(poll, Math.min(cadence, Math.max(0, duration - (performance.now() - started))));
      }
      if (!current()) { finish('canceled'); return; }
      try { gl = renderer?.getContext?.(); }
      catch (_) { finish('lost'); return; }
      if (!gl || renderer?.capabilities?.isWebGL2 === false ||
          typeof gl.fenceSync !== 'function' || typeof gl.clientWaitSync !== 'function' ||
          typeof gl.deleteSync !== 'function' || typeof gl.flush !== 'function') {
        finish('unsupported'); return;
      }
      if (lost()) { finish('lost'); return; }
      if (duration === 0) { finish('timeout'); return; }
      if (signal?.addEventListener) { signal.addEventListener('abort', abort, {once:true}); listening = true; }
      if (!current()) { finish('canceled'); return; }
      try {
        sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        // Cancellation during allocation still releases a newly returned sync.
        if (settled) { cleanup(); return; }
        if (!sync) { sync = null; finish('lost'); return; }
        if (!current()) { finish('canceled'); return; }
        gl.flush();
      } catch (_) { finish('lost'); return; }
      if (settled) return;
      poll();
    });
  }
  window.V2GPUPreparation = Object.freeze({wait});
})();
