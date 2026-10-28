/* An illustrative interaction sketch, not an emulator of the Dash firmware. */
(() => {
  'use strict';

  document.querySelectorAll('[data-dash-demo]').forEach(root => {
    const find = name => root.querySelector(`[data-dash-${name}]`);
    const controls = find('controls');
    const duration = find('duration');
    const action = find('action');
    const reset = find('reset');
    const clock = find('time');
    const stateLabel = find('state-label');
    const description = find('description');
    const progress = find('progress');
    const feedback = find('feedback');
    const live = find('live');
    const fallback = find('fallback');
    if (![controls, duration, action, reset, clock, stateLabel, description, progress, feedback, live].every(Boolean)) return;

    const states = {
      idle: ['Ready when you are', 'Choose a session, then give one thing your attention.', 'Start focus'],
      focus: ['A little focus', 'The timer is running. Tap or shake to see a small reaction.', 'Pause'],
      paused: ['Take your time', 'Your remaining time is held here until you resume.', 'Resume'],
      rest: ['A moment to reset', 'Session complete. Take a breath before the next one.', 'Start again']
    };
    let state = 'idle';
    let totalMs = Number(duration.value) * 1000;
    let remainingMs = totalMs;
    let deadline = 0;
    let tickHandle;
    let reactionHandle;
    let motionHandle;
    let interacted = false;
    const stage = root.querySelector('.dash-demo__stage');
    const face = root.querySelector('.dash-demo__face');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const subscribers = new Set();
    let reactionStartedAt = 0, motionStartedAt = 0;
    // The character UI owns the session. Other views subscribe to this same
    // state rather than starting another timer or dispatching synthetic data.
    const snapshot = () => Object.freeze({
      state, totalMs, remainingMs: state === 'focus' ? Math.max(0, deadline - Date.now()) : remainingMs,
      reaction: root.dataset.dashReaction || '', motion: root.dataset.dashMotion || '',
      reactionStartedAt, motionStartedAt,
      gaze: Object.freeze({
        x: (parseFloat(face?.style.getPropertyValue('--dash-gaze-x')) || 0) / 10,
        y: (parseFloat(face?.style.getPropertyValue('--dash-gaze-y')) || 0) / 6
      })
    });
    const emit = () => { const value = snapshot(); subscribers.forEach(callback => callback(value)); };
    const command = (name, value) => {
      if (name === 'action' || name === 'reset') {
        const button = name === 'action' ? action : reset;
        if (button.disabled) return false;
        button.click(); return true;
      }
      if (name === 'gesture') {
        const button = [...root.querySelectorAll('[data-dash-gesture]')].find(node => node.dataset.dashGesture === value);
        if (!button || button.disabled) return false;
        button.click(); return true;
      }
      if (name === 'duration' && !duration.disabled && [...duration.options].some(option => option.value === String(value))) {
        duration.value = String(value); duration.dispatchEvent(new Event('change', {bubbles:true})); return true;
      }
      return false;
    };
    root.dashController = Object.freeze({snapshot, command, subscribe(callback) {
      subscribers.add(callback); callback(snapshot()); return () => subscribers.delete(callback);
    }});

    const announce = message => { live.textContent = message; };
    const clearTick = () => {
      clearTimeout(tickHandle);
      tickHandle = undefined;
    };
    const clearReaction = () => {
      clearTimeout(reactionHandle);
      root.removeAttribute('data-dash-reaction');
      reactionStartedAt = 0; emit();
    };
    const centerGaze = () => {
      if (!face) return;
      face.style.setProperty('--dash-gaze-x', '0px');
      face.style.setProperty('--dash-gaze-y', '0px');
      emit();
    };
    const clearMotion = () => {
      clearTimeout(motionHandle);
      root.removeAttribute('data-dash-motion');
      motionStartedAt = 0;
      centerGaze();
    };
    function playMotion(name, durationMs = 1200) {
      clearMotion();
      if (reducedMotion.matches || document.hidden) return;
      // Repeated input can restart a sequence; there is no idle animation loop.
      void root.offsetWidth;
      root.dataset.dashMotion = name;
      motionStartedAt = performance.now(); emit();
      motionHandle = setTimeout(clearMotion, durationMs);
    }

    function renderTime() {
      const seconds = Math.ceil(remainingMs / 1000);
      clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      progress.value = totalMs - remainingMs;
      progress.max = totalMs;
      progress.setAttribute('aria-valuetext', `${Math.round((totalMs - remainingMs) / totalMs * 100)} percent complete`);
      emit();
    }

    function renderState(nextState) {
      state = nextState;
      root.dataset.dashState = state;
      const [label, detail, button] = states[state];
      stateLabel.textContent = label;
      description.textContent = detail;
      action.textContent = button;
      duration.disabled = state === 'focus' || state === 'paused';
      reset.disabled = state === 'idle';
      renderTime();
    }

    function update() {
      clearTick();
      if (state !== 'focus') return;
      remainingMs = Math.max(0, deadline - Date.now());
      if (remainingMs === 0) {
        clearReaction();
        renderState('rest');
        playMotion('complete', 1700);
        feedback.textContent = 'Timer finished → a softer expression and a moment to rest.';
        announce('Session complete. Take a breath. Start again whenever you are ready.');
        return;
      }
      renderTime();
      // Hidden tabs need no countdown rendering. The deadline remains the source
      // of truth when the page returns, including after browser timer throttling.
      if (!document.hidden) tickHandle = setTimeout(update, Math.min(1000, remainingMs));
    }

    action.addEventListener('click', () => {
      interacted = true;
      if (state === 'focus') {
        update();
        if (state !== 'focus') return;
        clearTick();
        clearReaction();
        renderState('paused');
        playMotion('pause', 1100);
        feedback.textContent = 'Pause → the timer holds and the eyes settle.';
        announce(`Session paused with ${clock.textContent} remaining.`);
      } else {
        const resuming = state === 'paused';
        if (!resuming) remainingMs = totalMs;
        deadline = Date.now() + remainingMs;
        clearReaction();
        renderState('focus');
        playMotion('focus', 1300);
        feedback.textContent = resuming ? 'Resume → pick up from the time you had left.' : 'Start → the character settles into focus.';
        announce(`${resuming ? 'Session resumed.' : 'Session started.'} ${duration.value === '10' ? 'This is a 10-second demonstration.' : duration.selectedOptions[0].textContent + '.'}`);
        update();
      }
    });

    reset.addEventListener('click', () => {
      interacted = true;
      clearTick();
      clearReaction();
      remainingMs = totalMs;
      deadline = 0;
      renderState('idle');
      playMotion('ready', 1100);
      feedback.textContent = 'Reset → ready for a fresh session.';
      announce('Session reset. Ready to start.');
    });

    duration.addEventListener('change', () => {
      interacted = true;
      if (state === 'focus' || state === 'paused') return;
      const seconds = Number(duration.value);
      if (![10, 1500, 2700, 3600].includes(seconds)) return;
      clearTick();
      clearReaction();
      clearMotion();
      totalMs = seconds * 1000;
      remainingMs = totalMs;
      renderState('idle');
      feedback.textContent = seconds === 10 ? 'Ten seconds to try the full focus-to-rest cycle.' : 'A real countdown for a quiet work session in this tab.';
      announce(`Selected ${duration.selectedOptions[0].textContent}.`);
    });

    root.querySelectorAll('[data-dash-gesture]').forEach(button => {
      button.addEventListener('click', () => {
        interacted = true;
        clearReaction();
        clearMotion();
        // Re-start a finite reaction on repeated input, without idle animation.
        void root.offsetWidth;
        const gesture = button.dataset.dashGesture;
        root.dataset.dashReaction = gesture;
        reactionStartedAt = performance.now(); emit();
        const message = gesture === 'tap'
          ? 'Tap → a quick blink. The timer keeps its place.'
          : 'Shake → a dizzy wobble. The timer keeps its place.';
        feedback.textContent = message;
        announce(message);
        reactionHandle = setTimeout(clearReaction, gesture === 'tap' ? 1150 : 1650);
      });
    });

    // A bounded, direct response to a mouse is enough to make the eyes feel
    // attentive. CSS eases each update; no animation frame loop is needed.
    if (stage && face) {
      stage.addEventListener('pointermove', event => {
        if (reducedMotion.matches || event.pointerType !== 'mouse' || root.dataset.dashReaction || root.dataset.dashMotion) return;
        const box = stage.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1));
        const y = Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1));
        face.style.setProperty('--dash-gaze-x', `${(x * 10).toFixed(1)}px`);
        face.style.setProperty('--dash-gaze-y', `${(y * 6).toFixed(1)}px`);
        emit();
      }, {passive: true});
      stage.addEventListener('pointerleave', centerGaze);
      stage.addEventListener('pointercancel', centerGaze);
    }
    reducedMotion.addEventListener('change', () => {
      clearMotion();
      clearReaction();
    });

    // Greet once when visible, then settle. Further motion follows user input.
    if ('IntersectionObserver' in window) {
      const arrival = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        arrival.disconnect();
        if (!interacted && state === 'idle') playMotion('welcome', 1900);
      }, {threshold: .25});
      arrival.observe(root);
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { clearTick(); clearReaction(); clearMotion(); }
      else update();
    });
    window.addEventListener('pageshow', update);
    window.addEventListener('pagehide', () => { clearTick(); clearReaction(); clearMotion(); });

    renderState('idle');
    controls.hidden = false;
    if (fallback) fallback.hidden = true;
    root.dataset.dashReady = 'true';
  });
})();
