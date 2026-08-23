import { animate, stagger } from "./vendor/anime.esm.min.js";

const motionAllowed = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.documentElement.dataset.motionEngine = "animejs-4.5.0";

if (motionAllowed) {
  const introItems = document.querySelectorAll(".home-intro-copy > *, .page-hero-inner > *");
  if (introItems.length) {
    animate(introItems, {
      opacity: [0, 1],
      y: [12, 0],
      delay: stagger(65),
      duration: 620,
      ease: "out(3)",
    });
  }

  const introMedia = document.querySelector(".home-hero-photo");
  if (introMedia) {
    animate(introMedia, {
      opacity: [0, 1],
      y: [18, 0],
      scale: [0.985, 1],
      duration: 900,
      delay: 180,
      ease: "out(4)",
    });
  }
}

const signalPath = document.querySelector("[data-signal-path]");

if (signalPath && motionAllowed) {
  const diagram = signalPath.querySelector("ol[data-path-stages]");
  const animatedContent = [...signalPath.querySelectorAll(
    "[data-path-label], [data-path-stage], [data-path-metric-label], [data-path-metric]",
  )];
  const runner = document.createElement("span");
  let runnerAnimation = null;

  runner.className = "signal-path-runner";
  runner.setAttribute("aria-hidden", "true");
  diagram?.append(runner);

  const runSignalMotion = () => {
    if (!diagram) return;
    runnerAnimation?.cancel();
    const distance = Math.max(0, diagram.clientWidth - runner.offsetWidth);
    runnerAnimation = animate(runner, {
      opacity: [0, 1, 1, 0],
      x: [0, distance],
      duration: 1350,
      ease: "inOut(3)",
    });
    animate(animatedContent, {
      opacity: [0, 1],
      y: [6, 0],
      delay: stagger(24),
      duration: 380,
      ease: "out(3)",
    });
  };

  signalPath.addEventListener("signalpathchange", runSignalMotion);
  const signalObserver = new IntersectionObserver((entries, observer) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    runSignalMotion();
    observer.disconnect();
  }, { threshold: 0.45 });
  signalObserver.observe(signalPath);
}

const projectJumpbar = document.querySelector("[data-project-jumpbar]");

if (projectJumpbar) {
  const jumpLinks = [...projectJumpbar.querySelectorAll("[data-project-jump]")];
  const indicator = projectJumpbar.querySelector("[data-project-jump-indicator]");
  const jumpInner = projectJumpbar.querySelector(".project-jumpbar-inner");
  const sections = jumpLinks
    .map((item) => document.getElementById(item.dataset.projectTarget))
    .filter(Boolean);
  let activeLink = null;
  let indicatorAnimation = null;
  let scrollFrame = 0;

  const placeJumpIndicator = (nextLink, shouldAnimate = true) => {
    if (!indicator || !jumpInner || !nextLink || nextLink === activeLink && shouldAnimate) return;
    activeLink = nextLink;
    const parentRect = jumpInner.getBoundingClientRect();
    const linkRect = nextLink.getBoundingClientRect();
    const x = linkRect.left - parentRect.left;
    jumpLinks.forEach((item) => {
      if (item === nextLink) {
        item.setAttribute("aria-current", "location");
      } else {
        item.removeAttribute("aria-current");
      }
    });
    if (motionAllowed && shouldAnimate) {
      indicatorAnimation?.cancel();
      indicatorAnimation = animate(indicator, {
        x,
        width: linkRect.width,
        duration: 420,
        ease: "out(4)",
      });
    } else {
      indicator.style.width = `${linkRect.width}px`;
      indicator.style.transform = `translateX(${x}px)`;
    }
  };

  const syncJumpbar = () => {
    scrollFrame = 0;
    const marker = window.scrollY + window.innerHeight * 0.32;
    let activeSection = sections[0];
    sections.forEach((section) => {
      if (section.offsetTop <= marker) activeSection = section;
    });
    const nextLink = jumpLinks.find((item) => item.dataset.projectTarget === activeSection?.id);
    if (nextLink) placeJumpIndicator(nextLink);
  };

  jumpLinks.forEach((jumpLink) => {
    jumpLink.addEventListener("click", () => placeJumpIndicator(jumpLink));
  });

  const initialTarget = window.location.hash.slice(1);
  const initialLink = jumpLinks.find((item) => item.dataset.projectTarget === initialTarget) || jumpLinks[0];
  window.requestAnimationFrame(() => placeJumpIndicator(initialLink, false));
  window.addEventListener("scroll", () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(syncJumpbar);
  }, { passive: true });
  window.addEventListener("resize", () => placeJumpIndicator(activeLink || jumpLinks[0], false));
}
