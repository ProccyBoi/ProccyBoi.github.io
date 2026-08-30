document.documentElement.classList.add("js");

const updatePageProgress = () => {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
  document.documentElement.style.setProperty("--page-progress", progress.toFixed(4));
};

let progressFrame = 0;
const requestPageProgress = () => {
  if (progressFrame) return;
  progressFrame = window.requestAnimationFrame(() => {
    progressFrame = 0;
    updatePageProgress();
  });
};

updatePageProgress();
window.addEventListener("scroll", requestPageProgress, { passive: true });
window.addEventListener("resize", requestPageProgress);

const navToggle = document.querySelector("[data-nav-toggle]");
const siteNav = document.querySelector("[data-site-nav]");
const desktopNavigation = window.matchMedia("(min-width: 721px)");
const navigationBackground = [...document.querySelectorAll("main, .site-footer")];

const syncNavigationAccessibility = (open = false) => {
  if (!siteNav) return;
  const isMobile = !desktopNavigation.matches;
  siteNav.toggleAttribute("inert", isMobile && !open);
  if (isMobile && !open) {
    siteNav.setAttribute("aria-hidden", "true");
  } else {
    siteNav.removeAttribute("aria-hidden");
  }
  navigationBackground.forEach((region) => {
    const hiddenBehindMenu = isMobile && open;
    region.toggleAttribute("inert", hiddenBehindMenu);
    if (hiddenBehindMenu) {
      region.setAttribute("aria-hidden", "true");
    } else {
      region.removeAttribute("aria-hidden");
    }
  });
};

const closeNavigation = (restoreFocus = false) => {
  if (!navToggle || !siteNav) return;
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "Open navigation");
  siteNav.dataset.open = "false";
  document.body.classList.remove("nav-open");
  syncNavigationAccessibility(false);
  if (restoreFocus) navToggle.focus();
};

navToggle?.addEventListener("click", () => {
  const open = navToggle.getAttribute("aria-expanded") !== "true";
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  siteNav.dataset.open = String(open);
  document.body.classList.toggle("nav-open", open);
  syncNavigationAccessibility(open);
  if (open) {
    window.requestAnimationFrame(() => siteNav.querySelector("a")?.focus());
  }
});

siteNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => closeNavigation(false));
});

const handleNavigationBreakpoint = (event) => {
  if (event.matches) {
    closeNavigation(false);
  } else {
    syncNavigationAccessibility(navToggle?.getAttribute("aria-expanded") === "true");
  }
};

if (desktopNavigation.addEventListener) {
  desktopNavigation.addEventListener("change", handleNavigationBreakpoint);
} else {
  desktopNavigation.addListener(handleNavigationBreakpoint);
}

syncNavigationAccessibility(false);

document.addEventListener("keydown", (event) => {
  const navigationOpen = navToggle?.getAttribute("aria-expanded") === "true";
  if (event.key === "Escape" && navigationOpen) {
    closeNavigation(true);
    return;
  }

  if (event.key !== "Tab" || !navigationOpen || !siteNav || !navToggle) return;
  const links = [...siteNav.querySelectorAll("a")];
  if (!links.length) return;
  const first = links[0];
  const last = navToggle;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

const liveRegion = document.querySelector("[data-live-region]");

const announce = (message) => {
  if (!liveRegion) return;
  liveRegion.textContent = "";
  window.setTimeout(() => {
    liveRegion.textContent = message;
  }, 20);
};

const copyText = async (value) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  document.execCommand("copy");
  field.remove();
};

document.querySelectorAll("[data-copy-email]").forEach((button) => {
  button.addEventListener("click", async () => {
    const email = button.dataset.copyEmail;
    if (!email) return;
    try {
      await copyText(email);
      announce(`Email copied: ${email}`);
    } catch {
      window.location.href = `mailto:${email}`;
    }
  });
});

document.querySelectorAll("[data-share-link]").forEach((button) => {
  button.addEventListener("click", async () => {
    const url = button.dataset.shareLink || window.location.href;
    try {
      await copyText(url);
      announce("Page link copied.");
    } catch {
      announce("The page link could not be copied.");
    }
  });
});

const zoomableImages = [...document.querySelectorAll("img[data-zoomable]")];
const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = lightbox?.querySelector("[data-lightbox-image]");
const lightboxCaption = lightbox?.querySelector("[data-lightbox-caption]");
const lightboxClose = lightbox?.querySelector("[data-lightbox-close]");
const lightboxPrevious = lightbox?.querySelector("[data-lightbox-prev]");
const lightboxNext = lightbox?.querySelector("[data-lightbox-next]");
let lightboxIndex = 0;
let lastFocusedElement = null;

const updateLightbox = () => {
  const source = zoomableImages[lightboxIndex];
  if (!source || !lightboxImage) return;
  lightboxImage.src = source.currentSrc || source.src;
  lightboxImage.alt = source.alt || "";
  if (lightboxCaption) {
    lightboxCaption.textContent = source.dataset.caption || source.alt || "Project photo";
  }
};

const openLightbox = (index) => {
  if (!lightbox || !lightboxImage) return;
  lightboxIndex = index;
  lastFocusedElement = document.activeElement;
  updateLightbox();
  if (typeof lightbox.showModal === "function") {
    lightbox.showModal();
  } else {
    lightbox.setAttribute("open", "");
  }
  lightboxClose?.focus();
};

const moveLightbox = (step) => {
  if (!zoomableImages.length) return;
  lightboxIndex = (lightboxIndex + step + zoomableImages.length) % zoomableImages.length;
  updateLightbox();
};

zoomableImages.forEach((image, index) => {
  image.tabIndex = 0;
  image.setAttribute("role", "button");
  image.setAttribute("aria-label", `Open image: ${image.alt || "project photo"}`);
  const figure = image.closest("figure");
  if (figure && !figure.querySelector(".zoom-cue")) {
    const cue = document.createElement("span");
    cue.className = "zoom-cue";
    cue.textContent = "Enlarge";
    cue.setAttribute("aria-hidden", "true");
    figure.append(cue);
  }
  image.addEventListener("click", () => openLightbox(index));
  image.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openLightbox(index);
    }
  });
});

lightboxPrevious?.addEventListener("click", () => moveLightbox(-1));
lightboxNext?.addEventListener("click", () => moveLightbox(1));
lightboxClose?.addEventListener("click", () => lightbox?.close());

lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) lightbox.close();
});

lightbox?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") moveLightbox(-1);
  if (event.key === "ArrowRight") moveLightbox(1);
});

lightbox?.addEventListener("close", () => {
  if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
});

document.querySelectorAll("[data-current-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});

const sydneyTime = document.querySelector("[data-sydney-time]");

if (sydneyTime) {
  const sydneyClock = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const updateSydneyClock = () => {
    sydneyTime.textContent = sydneyClock.format(new Date());
  };
  updateSydneyClock();
  window.setInterval(updateSydneyClock, 30_000);
}

const signalPath = document.querySelector("[data-signal-path]");

if (signalPath) {
  const projectButtons = [...signalPath.querySelectorAll("[data-signal-project]")];
  const name = signalPath.querySelector("[data-path-name]:not([data-signal-project])");
  const diagram = signalPath.querySelector("ol[data-path-stages]");
  const labels = [...signalPath.querySelectorAll("[data-path-label]")];
  const stages = [...signalPath.querySelectorAll("[data-path-stage]")];
  const metricsPanel = signalPath.querySelector("[data-path-metrics]");
  const metricLabels = [...signalPath.querySelectorAll("[data-path-metric-label]")];
  const metrics = [...signalPath.querySelectorAll("[data-path-metric]")];
  const summary = signalPath.querySelector("[data-path-summary]:not([data-signal-project])");
  const link = signalPath.querySelector("[data-path-link]");

  const selectSignalProject = (button) => {
    const nextLabels = button.dataset.pathLabels?.split("|") || [];
    const nextStages = button.dataset.pathStages?.split("|") || [];
    const nextMetricLabels = button.dataset.pathMetricLabels?.split("|") || [];
    const nextMetrics = button.dataset.pathMetricValues?.split("|") || [];
    const projectName = button.dataset.pathName || "Project";

    projectButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    if (name) name.textContent = projectName;
    if (diagram) diagram.setAttribute("aria-label", `${projectName} signal path`);
    labels.forEach((label, index) => {
      label.textContent = `${String(index + 1).padStart(2, "0")} / ${nextLabels[index] || "Stage"}`;
    });
    stages.forEach((stage, index) => {
      stage.textContent = nextStages[index] || "";
    });
    metricLabels.forEach((label, index) => {
      label.textContent = nextMetricLabels[index] || "Metric";
    });
    metrics.forEach((metric, index) => {
      metric.textContent = nextMetrics[index] || "";
    });
    if (metricsPanel) metricsPanel.setAttribute("aria-label", `${projectName} system metrics`);
    if (summary) summary.textContent = button.dataset.pathSummary || "";
    if (link) {
      link.href = button.dataset.pathHref || "projects/";
      link.firstChild.textContent = `Open ${projectName} `;
    }
    signalPath.dispatchEvent(new CustomEvent("signalpathchange", { detail: { projectName } }));
  };

  projectButtons.forEach((button) => {
    button.addEventListener("click", () => selectSignalProject(button));
  });
}
