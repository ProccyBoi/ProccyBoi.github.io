/* Time-based visual easing only. The document always keeps native scrolling. */
(function (scope) {
  'use strict';
  const epsilon = .00008;
  const step = (current, target, milliseconds) => {
    const next = current + (target - current) * (1 - Math.exp(-Math.max(0, Math.min(100, milliseconds)) / 70));
    return Math.abs(target - next) < epsilon ? target : next;
  };
  const api = { step, epsilon, jump: .18 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.V2ScrollSmoothing = api;
})(typeof window === 'undefined' ? globalThis : window);
