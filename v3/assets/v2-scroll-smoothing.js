/* Time-based visual easing only. The document always keeps native scrolling. */
(function (scope) {
  'use strict';
  const epsilon = .00008;
  // Visible frame gaps use real elapsed time; lifecycle resets live in the
  // controller. Capping dt would add artificial lag on a slow renderer.
  const step = (current, target, milliseconds) => {
    const next = current + (target - current) * (1 - Math.exp(-Math.max(0, milliseconds) / 70));
    return Math.abs(target - next) < epsilon ? target : next;
  };
  const api = { step, epsilon, jump: .18 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.V2ScrollSmoothing = api;
})(typeof window === 'undefined' ? globalThis : window);
