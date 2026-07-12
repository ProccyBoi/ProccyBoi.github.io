document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Mobile navigation keeps the full route list in the HTML and only changes visibility.
const navToggle = document.querySelector("[data-nav-toggle]");
const siteNav = document.querySelector("[data-site-nav]");
const desktopNavigation = window.matchMedia("(min-width: 761px)");

const syncNavigationAccessibility = (open = false) => {
  if (!siteNav) return;
  const isMobile = !desktopNavigation.matches;
  siteNav.inert = isMobile && !open;
  if (isMobile && !open) {
    siteNav.setAttribute("aria-hidden", "true");
  } else {
    siteNav.removeAttribute("aria-hidden");
  }
};

const closeNavigation = () => {
  if (!navToggle || !siteNav) return;
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "Open navigation");
  siteNav.dataset.open = "false";
  document.body.classList.remove("nav-open");
  syncNavigationAccessibility(false);
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

siteNav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeNavigation));

const handleNavigationBreakpoint = (event) => {
  if (event.matches) {
    closeNavigation();
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
  if (event.key === "Escape" && navToggle?.getAttribute("aria-expanded") === "true") {
    closeNavigation();
    navToggle.focus();
  }

  if (event.key === "Tab" && navToggle?.getAttribute("aria-expanded") === "true" && siteNav) {
    const focusable = [...siteNav.querySelectorAll("a"), navToggle];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

// Progressive content reveals. Everything remains visible without JavaScript.
const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));

if (!reducedMotion.matches && "IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.dataset.visible = "true";
        revealObserver.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8%", threshold: 0.12 }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => (item.dataset.visible = "true"));
}

// The landing-page project ledger swaps one large, stable preview instead of animating every card.
const projectPreview = document.querySelector("[data-project-preview]");
const projectPreviewImage = projectPreview?.querySelector("[data-preview-image]");
const projectPreviewIndex = projectPreview?.querySelector("[data-preview-index]");
const projectPreviewTitle = projectPreview?.querySelector("[data-preview-title]");
const projectPreviewMeta = projectPreview?.querySelector("[data-preview-meta]");
const projectRows = Array.from(document.querySelectorAll("[data-project-row]"));

const setProjectPreview = (row) => {
  if (!projectPreview || !projectPreviewImage || !row) return;

  const { preview, previewAlt, projectIndex, projectTitle, projectMeta } = row.dataset;
  if (!preview) return;

  projectRows.forEach((item) => {
    if (item === row) {
      item.dataset.active = "true";
    } else {
      delete item.dataset.active;
    }
  });
  projectPreview.dataset.switching = "true";

  const apply = () => {
    projectPreviewImage.src = preview;
    projectPreviewImage.alt = previewAlt || "";
    if (projectPreviewIndex) projectPreviewIndex.textContent = projectIndex || "";
    if (projectPreviewTitle) projectPreviewTitle.textContent = projectTitle || "";
    if (projectPreviewMeta) projectPreviewMeta.textContent = projectMeta || "";
    projectPreview.dataset.switching = "false";
  };

  if (reducedMotion.matches) {
    apply();
  } else {
    window.setTimeout(apply, 90);
  }
};

projectRows.forEach((row) => {
  row.addEventListener("pointerenter", () => setProjectPreview(row));
  row.addEventListener("focus", () => setProjectPreview(row));
});

if (projectRows.length) setProjectPreview(projectRows[0]);

// A restrained hero probe: real content and navigation never depend on the canvas.
const signalCanvas = document.querySelector("[data-signal-field]");
const heroStage = document.querySelector("[data-hero-stage]");
const coordinateReadout = document.querySelector("[data-coordinates]");

if (signalCanvas && heroStage && !reducedMotion.matches && finePointer.matches) {
  const context = signalCanvas.getContext("2d", { alpha: true });
  const points = [
    [0.08, 0.18], [0.22, 0.18], [0.22, 0.36], [0.39, 0.36],
    [0.39, 0.62], [0.58, 0.62], [0.58, 0.28], [0.77, 0.28],
    [0.77, 0.72], [0.91, 0.72]
  ];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let pointer = { x: 0.68, y: 0.42 };
  let target = { ...pointer };
  let frame = 0;
  let active = true;
  let inViewport = true;

  const resize = () => {
    const bounds = heroStage.getBoundingClientRect();
    width = Math.max(bounds.width, 1);
    height = Math.max(bounds.height, 1);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    signalCanvas.width = Math.round(width * dpr);
    signalCanvas.height = Math.round(height * dpr);
    signalCanvas.style.width = `${width}px`;
    signalCanvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = () => {
    if (!active) return;

    pointer.x += (target.x - pointer.x) * 0.075;
    pointer.y += (target.y - pointer.y) * 0.075;
    context.clearRect(0, 0, width, height);

    context.lineWidth = 1;
    context.strokeStyle = "rgba(103, 213, 255, 0.26)";
    context.beginPath();
    points.forEach(([x, y], index) => {
      const px = x * width;
      const py = y * height;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.stroke();

    points.forEach(([x, y], index) => {
      context.beginPath();
      context.fillStyle = index % 3 === 0 ? "rgba(231, 169, 75, 0.78)" : "rgba(232, 237, 242, 0.5)";
      context.arc(x * width, y * height, index % 3 === 0 ? 2.5 : 1.6, 0, Math.PI * 2);
      context.fill();
    });

    const px = pointer.x * width;
    const py = pointer.y * height;
    context.strokeStyle = "rgba(103, 213, 255, 0.78)";
    context.beginPath();
    context.arc(px, py, 17, 0, Math.PI * 2);
    context.moveTo(px - 25, py);
    context.lineTo(px + 25, py);
    context.moveTo(px, py - 25);
    context.lineTo(px, py + 25);
    context.stroke();

    const nearest = points.reduce(
      (best, point, index) => {
        const distance = Math.hypot(point[0] - pointer.x, point[1] - pointer.y);
        return distance < best.distance ? { point, index, distance } : best;
      },
      { point: points[0], index: 0, distance: Infinity }
    );

    if (nearest.distance < 0.14) {
      context.strokeStyle = "rgba(231, 169, 75, 0.86)";
      context.beginPath();
      context.moveTo(px, py);
      context.lineTo(nearest.point[0] * width, nearest.point[1] * height);
      context.stroke();
    }

    frame = window.requestAnimationFrame(draw);
  };

  heroStage.addEventListener(
    "pointermove",
    (event) => {
      const bounds = heroStage.getBoundingClientRect();
      target = {
        x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
        y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
      };
      if (coordinateReadout) {
        coordinateReadout.textContent = `X ${String(Math.round(target.x * 1000)).padStart(4, "0")} / Y ${String(Math.round(target.y * 1000)).padStart(4, "0")}`;
      }
    },
    { passive: true }
  );

  const syncAnimationState = () => {
    const nextActive = !document.hidden && inViewport;
    if (nextActive === active) return;
    active = nextActive;
    window.cancelAnimationFrame(frame);
    if (active) draw();
  };

  document.addEventListener("visibilitychange", syncAnimationState);

  if ("IntersectionObserver" in window) {
    const stageObserver = new IntersectionObserver((entries) => {
      inViewport = entries[0]?.isIntersecting ?? true;
      syncAnimationState();
    });
    stageObserver.observe(heroStage);
  }

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(heroStage);
  } else {
    window.addEventListener("resize", resize);
  }
  resize();
  draw();
}

// Copy and share helpers for contact details and archive links.
const announce = (message) => {
  const liveRegion = document.querySelector("[data-live-region]");
  if (!liveRegion) return;
  liveRegion.textContent = "";
  window.setTimeout(() => (liveRegion.textContent = message), 20);
};

const copyText = async (value) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
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
    try {
      await copyText(email);
      announce(`Email copied: ${email}`);
      button.dataset.copied = "true";
      window.setTimeout(() => (button.dataset.copied = "false"), 1800);
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
      announce("Share link copied.");
      button.dataset.copied = "true";
      window.setTimeout(() => (button.dataset.copied = "false"), 1800);
    } catch (error) {
      if (error?.name !== "AbortError") announce("Could not copy the link.");
    }
  });
});

// Accessible image inspection for project photography.
const zoomableImages = Array.from(document.querySelectorAll("img[data-zoomable]"));
const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = lightbox?.querySelector("[data-lightbox-image]");
const lightboxCaption = lightbox?.querySelector("[data-lightbox-caption]");
const lightboxClose = lightbox?.querySelector("[data-lightbox-close]");
let lightboxIndex = 0;
let lightboxTrigger = null;

const showLightboxImage = (index) => {
  if (!lightboxImage || !lightboxCaption || !zoomableImages.length) return;
  lightboxIndex = (index + zoomableImages.length) % zoomableImages.length;
  const source = zoomableImages[lightboxIndex];
  lightboxImage.src = source.currentSrc || source.src;
  lightboxImage.alt = source.alt;
  lightboxCaption.textContent = source.dataset.caption || source.alt;
};

zoomableImages.forEach((image, index) => {
  image.tabIndex = 0;
  image.setAttribute("role", "button");
  image.setAttribute("aria-label", `Open image: ${image.alt}`);

  const open = () => {
    if (!lightbox) return;
    lightboxTrigger = image;
    showLightboxImage(index);
    lightbox.showModal();
  };

  image.addEventListener("click", open);
  image.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });
});

lightboxClose?.addEventListener("click", () => lightbox.close());
lightbox?.querySelector("[data-lightbox-prev]")?.addEventListener("click", () => showLightboxImage(lightboxIndex - 1));
lightbox?.querySelector("[data-lightbox-next]")?.addEventListener("click", () => showLightboxImage(lightboxIndex + 1));
lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) lightbox.close();
});
lightbox?.addEventListener("close", () => lightboxTrigger?.focus());

document.addEventListener("keydown", (event) => {
  if (!lightbox?.open) return;
  if (event.key === "ArrowLeft") showLightboxImage(lightboxIndex - 1);
  if (event.key === "ArrowRight") showLightboxImage(lightboxIndex + 1);
});

document.querySelectorAll("[data-current-year]").forEach((node) => {
  node.textContent = new Date().getFullYear();
});
