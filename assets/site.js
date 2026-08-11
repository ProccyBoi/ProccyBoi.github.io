document.documentElement.classList.add("js");

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

const signalBench = document.querySelector("[data-signal-bench]");

if (signalBench) {
  const canvas = signalBench.querySelector("[data-signal-canvas]");
  const context = canvas?.getContext("2d");
  const routeButtons = [...signalBench.querySelectorAll("[data-signal-route]")];
  const stageLabel = signalBench.querySelector("[data-signal-stage-label]");
  const indexLabel = signalBench.querySelector("[data-signal-index]");
  const title = signalBench.querySelector("[data-signal-title]");
  const chain = signalBench.querySelector("[data-signal-chain]");
  const description = signalBench.querySelector("[data-signal-description]");
  const projectLink = signalBench.querySelector("[data-signal-link]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const monoFont = getComputedStyle(document.documentElement).getPropertyValue("--mono");

  const routes = {
    usb: {
      index: "01",
      label: "USB / PROGRAMMING",
      title: "USB programming",
      chain: "USB-C \u2192 CH340K \u2192 ESP32-S3",
      description: "The serial interface handles programming and reset without needing a separate adapter.",
      link: "projects/framework-expansion-card/",
      linkLabel: "Open Framework ESP32 Card",
      color: "#4f82bd",
      edges: [["usb", "serial"], ["serial", "esp32"]]
    },
    rf: {
      index: "02",
      label: "915 MHZ / RADIO",
      title: "LoRa radio",
      chain: "ESP32 \u2192 LoRa transceiver \u2192 915 MHz antenna",
      description: "Packets leave the controller over SPI, pass through the radio and reach the antenna on a controlled RF path.",
      link: "projects/lora-receiver/",
      linkLabel: "Open LoRa Receiver + GNSS",
      color: "#b66a3c",
      edges: [["esp32", "lora"], ["lora", "rfant"]]
    },
    gnss: {
      index: "03",
      label: "GNSS / POSITION",
      title: "GNSS positioning",
      chain: "GNSS antenna \u2192 NEO-M9N \u2192 ESP32",
      description: "The receiver turns satellite signals into position and timing data for logging and telemetry.",
      link: "projects/lora-receiver/",
      linkLabel: "Open LoRa Receiver + GNSS",
      color: "#4f82bd",
      edges: [["gnssant", "gnss"], ["gnss", "esp32"]]
    },
    power: {
      index: "04",
      label: "POWER / 3V3 RAIL",
      title: "Regulated power",
      chain: "USB-C \u2192 3V3 regulator \u2192 ESP32-S3",
      description: "One regulated rail feeds the controller, radio and positioning hardware while keeping each load decoupled locally.",
      link: "projects/framework-expansion-card/",
      linkLabel: "Open Framework ESP32 Card",
      color: "#b66a3c",
      edges: [["usb", "power"], ["power", "esp32"], ["power", "lora"], ["power", "gnss"]]
    }
  };

  const nodes = {
    usb: { x: 0.12, y: 0.73, label: "USB-C", kind: "connector" },
    serial: { x: 0.28, y: 0.67, label: "CH340K", kind: "chip" },
    power: { x: 0.27, y: 0.3, label: "3V3", kind: "power" },
    esp32: { x: 0.5, y: 0.5, label: "ESP32", kind: "main" },
    lora: { x: 0.7, y: 0.27, label: "LoRa", kind: "chip" },
    gnss: { x: 0.72, y: 0.72, label: "NEO-M9N", kind: "chip" },
    rfant: { x: 0.88, y: 0.19, label: "915M", kind: "antenna" },
    gnssant: { x: 0.88, y: 0.82, label: "GNSS", kind: "antenna" }
  };

  const allEdges = [...new Map(
    Object.values(routes)
      .flatMap((route) => route.edges)
      .map((edge) => [edge.join("-"), edge])
  ).values()];

  let activeRoute = "usb";
  let animationFrame = 0;
  let animationStart = performance.now();
  let probe = null;
  let signalBenchVisible = true;

  const roundedRect = (ctx, x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  };

  const nodePoint = (node, width, height) => ({
    x: width * node.x,
    y: height * node.y
  });

  const edgePoints = (edge, width, height) => {
    const start = nodePoint(nodes[edge[0]], width, height);
    const end = nodePoint(nodes[edge[1]], width, height);
    const middleX = start.x + ((end.x - start.x) * 0.52);
    return [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end];
  };

  const drawPolyline = (ctx, points) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.stroke();
  };

  const pointAlong = (points, progress) => {
    const segments = points.slice(1).map((point, index) => {
      const previous = points[index];
      return Math.hypot(point.x - previous.x, point.y - previous.y);
    });
    const total = segments.reduce((sum, length) => sum + length, 0);
    let remaining = progress * total;
    for (let index = 0; index < segments.length; index += 1) {
      if (remaining <= segments[index]) {
        const from = points[index];
        const to = points[index + 1];
        const amount = segments[index] ? remaining / segments[index] : 0;
        return {
          x: from.x + ((to.x - from.x) * amount),
          y: from.y + ((to.y - from.y) * amount)
        };
      }
      remaining -= segments[index];
    }
    return points.at(-1);
  };

  const renderSignalBench = (time = performance.now()) => {
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (!width || !height) return;

    context.clearRect(0, 0, width, height);
    context.save();
    context.strokeStyle = "rgba(232, 230, 222, 0.055)";
    context.fillStyle = "rgba(232, 230, 222, 0.12)";
    context.lineWidth = 1;
    for (let x = 16; x < width; x += 28) {
      for (let y = 16; y < height; y += 28) {
        context.fillRect(x, y, 1, 1);
      }
    }

    const boardInset = Math.min(width, height) * 0.07;
    roundedRect(context, boardInset, boardInset, width - (boardInset * 2), height - (boardInset * 2), 13);
    context.strokeStyle = "rgba(232, 230, 222, 0.14)";
    context.stroke();

    context.lineCap = "round";
    context.lineJoin = "round";
    allEdges.forEach((edge) => {
      context.strokeStyle = "rgba(165, 167, 159, 0.17)";
      context.lineWidth = 1;
      drawPolyline(context, edgePoints(edge, width, height));
    });

    const route = routes[activeRoute];
    route.edges.forEach((edge, edgeIndex) => {
      const points = edgePoints(edge, width, height);
      context.strokeStyle = route.color;
      context.lineWidth = 2;
      context.shadowColor = route.color;
      context.shadowBlur = 7;
      drawPolyline(context, points);
      context.shadowBlur = 0;

      if (!reducedMotion.matches) {
        for (let pulse = 0; pulse < 2; pulse += 1) {
          const progress = (((time - animationStart) / 2100) + (pulse * 0.5) + (edgeIndex * 0.18)) % 1;
          const point = pointAlong(points, progress);
          context.beginPath();
          context.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
          context.fillStyle = route.color;
          context.shadowColor = route.color;
          context.shadowBlur = 12;
          context.fill();
          context.shadowBlur = 0;
        }
      }
    });

    Object.entries(nodes).forEach(([key, node]) => {
      const point = nodePoint(node, width, height);
      const active = route.edges.some((edge) => edge.includes(key));
      const nodeWidth = node.kind === "main" ? 90 : node.kind === "antenna" ? 54 : 70;
      const nodeHeight = node.kind === "main" ? 52 : 38;
      roundedRect(context, point.x - (nodeWidth / 2), point.y - (nodeHeight / 2), nodeWidth, nodeHeight, node.kind === "antenna" ? 19 : 5);
      context.fillStyle = active ? "rgba(232, 230, 222, 0.095)" : "rgba(24, 25, 22, 0.95)";
      context.strokeStyle = active ? route.color : "rgba(165, 167, 159, 0.34)";
      context.lineWidth = active ? 1.5 : 1;
      context.fill();
      context.stroke();
      context.fillStyle = active ? "#e8e6de" : "#888b84";
      context.font = `${node.kind === "main" ? 11 : 9}px ${monoFont}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(node.label, point.x, point.y);
    });

    if (probe) {
      const nearest = Object.values(nodes)
        .map((node) => ({ node, point: nodePoint(node, width, height) }))
        .sort((a, b) => Math.hypot(probe.x - a.point.x, probe.y - a.point.y) - Math.hypot(probe.x - b.point.x, probe.y - b.point.y))[0];
      context.strokeStyle = "rgba(232, 230, 222, 0.7)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(probe.x - 8, probe.y);
      context.lineTo(probe.x + 8, probe.y);
      context.moveTo(probe.x, probe.y - 8);
      context.lineTo(probe.x, probe.y + 8);
      context.stroke();
      if (nearest && Math.hypot(probe.x - nearest.point.x, probe.y - nearest.point.y) < 82) {
        context.fillStyle = "#e8e6de";
        context.font = `10px ${monoFont}`;
        context.textAlign = probe.x > width - 110 ? "right" : "left";
        context.fillText(nearest.node.label, probe.x + (probe.x > width - 110 ? -12 : 12), probe.y - 12);
      }
    }

    context.restore();
  };

  const scheduleSignalBench = () => {
    window.cancelAnimationFrame(animationFrame);
    if (reducedMotion.matches || document.hidden || !signalBenchVisible) {
      renderSignalBench();
      return;
    }
    const tick = (time) => {
      renderSignalBench(time);
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
  };

  const resizeSignalCanvas = () => {
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }
    renderSignalBench();
  };

  const selectRoute = (key) => {
    const route = routes[key];
    if (!route) return;
    activeRoute = key;
    animationStart = performance.now();
    routeButtons.forEach((button) => {
      const selected = button.dataset.signalRoute === key;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    if (stageLabel) stageLabel.textContent = route.label;
    if (indexLabel) indexLabel.textContent = `PATH / ${route.index}`;
    if (title) title.textContent = route.title;
    if (chain) chain.textContent = route.chain;
    if (description) description.textContent = route.description;
    if (projectLink) {
      projectLink.href = route.link;
      projectLink.innerHTML = `${route.linkLabel} <span aria-hidden="true">&rarr;</span>`;
    }
    renderSignalBench();
  };

  routeButtons.forEach((button) => {
    button.addEventListener("click", () => selectRoute(button.dataset.signalRoute));
  });

  canvas?.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    probe = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  });

  canvas?.addEventListener("pointerleave", () => {
    probe = null;
  });

  if ("ResizeObserver" in window) {
    new ResizeObserver(resizeSignalCanvas).observe(signalBench.querySelector(".signal-stage"));
  } else {
    window.addEventListener("resize", resizeSignalCanvas);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      signalBenchVisible = entry.isIntersecting;
      scheduleSignalBench();
    }, { rootMargin: "120px 0px" }).observe(signalBench);
  }

  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener("change", scheduleSignalBench);
  } else {
    reducedMotion.addListener(scheduleSignalBench);
  }

  document.addEventListener("visibilitychange", scheduleSignalBench);
  selectRoute(activeRoute);
  resizeSignalCanvas();
  scheduleSignalBench();
}

document.querySelectorAll("[data-current-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});
