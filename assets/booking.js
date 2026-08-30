(() => {
  const app = document.querySelector("[data-booking-app]");
  if (!app) return;

  const endpoint = app.dataset.bookingEndpoint?.trim() || "";
  const calendar = app.querySelector("[data-booking-calendar]");
  const status = app.querySelector("[data-booking-status]");
  const days = app.querySelector("[data-booking-days]");
  const weekLabel = app.querySelector("[data-week-label]");
  const previousWeek = app.querySelector("[data-week-previous]");
  const nextWeek = app.querySelector("[data-week-next]");
  const cardTitle = app.querySelector("[data-booking-card-title]");
  const details = app.querySelector("[data-booking-details]");
  const selectionTime = app.querySelector("[data-selection-time]");
  const selectionMeta = app.querySelector("[data-selection-meta]");
  const form = app.querySelector("[data-booking-form]");
  const submit = app.querySelector("[data-booking-submit]");
  const formError = app.querySelector("[data-booking-form-error]");
  const success = app.querySelector("[data-booking-success]");
  const successCopy = app.querySelector("[data-booking-success-copy]");
  const bookAnother = app.querySelector("[data-book-another]");
  const durationInputs = [...app.querySelectorAll('input[name="duration-choice"]')];
  const formatInputs = [...app.querySelectorAll('input[name="format-choice"]')];
  const visitorTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Sydney";
  const sydneyTimeZone = "Australia/Sydney";
  const minWeekOffset = 0;
  const maxWeekOffset = 8;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = {
    duration: 15,
    format: "online",
    weekOffset: 0,
    token: "",
    selectedSlot: null,
    requestNumber: 0,
    submitTimer: 0,
  };

  const visitorZoneLabel = document.querySelector("[data-visitor-time-zone]");
  if (visitorZoneLabel) {
    const readableZone = visitorTimeZone.replaceAll("_", " ").replace("/", " / ");
    visitorZoneLabel.textContent = visitorTimeZone === sydneyTimeZone
      ? "Times below are in Sydney time"
      : `Times below use ${readableZone}`;
  }

  const datePartsInZone = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
    };
  };

  const dateKeyInZone = (date, timeZone) => {
    const value = datePartsInZone(date, timeZone);
    return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
  };

  const isoDate = (date) => [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");

  const currentSydneyParts = datePartsInZone(new Date(), sydneyTimeZone);
  const currentSydneyDate = new Date(Date.UTC(
    currentSydneyParts.year,
    currentSydneyParts.month - 1,
    currentSydneyParts.day,
  ));
  const weekdayIndex = (currentSydneyDate.getUTCDay() + 6) % 7;
  const currentWeekMonday = new Date(currentSydneyDate);
  currentWeekMonday.setUTCDate(currentWeekMonday.getUTCDate() - weekdayIndex);

  const selectedWeekStart = () => {
    const next = new Date(currentWeekMonday);
    next.setUTCDate(next.getUTCDate() + state.weekOffset * 7);
    return next;
  };

  const weekRangeText = () => {
    const start = selectedWeekStart();
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 4);
    const shortDate = new Intl.DateTimeFormat("en-AU", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
    });
    return `${shortDate.format(start)} – ${shortDate.format(end)}`;
  };

  const setStatus = (message, options = {}) => {
    status.hidden = false;
    days.hidden = true;
    status.replaceChildren();
    if (options.loading) {
      const loader = document.createElement("span");
      loader.className = "booking-loader";
      loader.setAttribute("aria-hidden", "true");
      status.append(loader);
    }
    const copy = document.createElement("p");
    if (options.heading) {
      const heading = document.createElement("strong");
      heading.textContent = options.heading;
      copy.append(heading);
    }
    copy.append(document.createTextNode(message));
    status.append(copy);
  };

  const cleanupJsonp = (callbackName, script) => {
    delete window[callbackName];
    script.remove();
  };

  const requestAvailability = (startDate, duration) => new Promise((resolve, reject) => {
    const callbackName = `andrewBookingAvailability${Date.now()}${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const url = new URL(endpoint);
    url.searchParams.set("action", "availability");
    url.searchParams.set("start", startDate);
    url.searchParams.set("duration", String(duration));
    url.searchParams.set("callback", callbackName);
    const timer = window.setTimeout(() => {
      cleanupJsonp(callbackName, script);
      reject(new Error("The calendar took too long to respond."));
    }, 12_000);

    window[callbackName] = (payload) => {
      window.clearTimeout(timer);
      cleanupJsonp(callbackName, script);
      resolve(payload);
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      cleanupJsonp(callbackName, script);
      reject(new Error("The calendar could not be reached."));
    };
    script.src = url.toString();
    document.head.append(script);
  });

  const dayHeading = new Intl.DateTimeFormat("en-AU", {
    timeZone: visitorTimeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const weekdayName = new Intl.DateTimeFormat("en-AU", {
    timeZone: visitorTimeZone,
    weekday: "long",
  });
  const slotTime = new Intl.DateTimeFormat("en-AU", {
    timeZone: visitorTimeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  const fullSelectionTime = new Intl.DateTimeFormat("en-AU", {
    timeZone: visitorTimeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });

  const chooseSlot = (button, slot) => {
    days.querySelectorAll("[data-slot]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
    state.selectedSlot = slot;
    selectionTime.textContent = fullSelectionTime.format(new Date(slot.start));
    selectionMeta.textContent = `${state.duration} minutes · ${state.format === "online" ? "Online via Google Meet" : "In person"}`;
    details.hidden = false;
    formError.hidden = true;
    form.querySelector("[data-form-start]").value = slot.start;
    form.querySelector("[data-form-duration]").value = String(state.duration);
    form.querySelector("[data-form-format]").value = state.format;
    form.querySelector("[data-form-time-zone]").value = visitorTimeZone;
    form.querySelector("[data-form-token]").value = state.token;
    form.querySelector("[data-form-origin]").value = window.location.origin;
    details.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
  };

  const renderDays = (payload) => {
    const groups = new Map();
    payload.days.forEach((day) => {
      if (!day.slots.length) {
        const anchor = new Date(day.anchor);
        const key = dateKeyInZone(anchor, visitorTimeZone);
        if (!groups.has(key)) groups.set(key, { key, anchor, slots: [] });
        return;
      }

      day.slots.forEach((slot) => {
        const start = new Date(slot.start);
        const key = dateKeyInZone(start, visitorTimeZone);
        if (!groups.has(key)) groups.set(key, { key, anchor: start, slots: [] });
        groups.get(key).slots.push(slot);
      });
    });

    const orderedGroups = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
    days.innerHTML = "";
    days.style.setProperty("--booking-day-count", String(Math.max(orderedGroups.length, 1)));

    orderedGroups.forEach((group) => {
      const article = document.createElement("article");
      article.className = "booking-day";
      const heading = document.createElement("div");
      heading.className = "booking-day-head";
      const weekday = document.createElement("span");
      weekday.textContent = weekdayName.format(group.anchor);
      const date = document.createElement("strong");
      date.textContent = dayHeading.format(group.anchor);
      heading.append(weekday, date);
      article.append(heading);

      if (!group.slots.length) {
        const empty = document.createElement("p");
        empty.className = "booking-day-empty";
        empty.textContent = "No openings";
        article.append(empty);
      } else {
        const slotList = document.createElement("div");
        slotList.className = "booking-slots";
        group.slots.forEach((slot) => {
          const button = document.createElement("button");
          button.className = "booking-slot";
          button.type = "button";
          button.dataset.slot = slot.start;
          button.setAttribute("aria-pressed", "false");
          button.textContent = slotTime.format(new Date(slot.start));
          button.setAttribute(
            "aria-label",
            `${fullSelectionTime.format(new Date(slot.start))}, ${state.duration} minutes`,
          );
          button.addEventListener("click", () => chooseSlot(button, slot));
          slotList.append(button);
        });
        article.append(slotList);
      }
      days.append(article);
    });

    status.hidden = true;
    days.hidden = false;
  };

  const loadAvailability = async () => {
    state.requestNumber += 1;
    const requestNumber = state.requestNumber;
    state.selectedSlot = null;
    state.token = "";
    details.hidden = true;
    success.hidden = true;
    cardTitle.textContent = `Choose a ${state.duration}-minute time`;
    weekLabel.textContent = weekRangeText();
    previousWeek.disabled = state.weekOffset <= minWeekOffset;
    nextWeek.disabled = state.weekOffset >= maxWeekOffset;
    setStatus("Checking the calendar…", { loading: true });

    if (!endpoint) {
      setStatus("Please email me while the booking calendar is being updated.", {
        heading: "Online booking is temporarily unavailable.",
      });
      return;
    }

    try {
      const payload = await requestAvailability(isoDate(selectedWeekStart()), state.duration);
      if (requestNumber !== state.requestNumber) return;
      if (!payload?.ok) throw new Error(payload?.message || "Availability could not be loaded.");
      const hasOpenings = payload.days.some((day) => day.slots.length > 0);
      if (!hasOpenings && state.weekOffset === 0 && maxWeekOffset > 0) {
        state.weekOffset = 1;
        loadAvailability();
        return;
      }
      state.token = payload.token;
      renderDays(payload);
    } catch (error) {
      if (requestNumber !== state.requestNumber) return;
      setStatus("Try the next week, refresh the page, or email me instead.", {
        heading: error.message || "Availability could not be loaded.",
      });
    }
  };

  const updateFormat = () => {
    state.format = formatInputs.find((input) => input.checked)?.value || "online";
    if (!state.selectedSlot) return;
    selectionMeta.textContent = `${state.duration} minutes · ${state.format === "online" ? "Online via Google Meet" : "In person"}`;
    form.querySelector("[data-form-format]").value = state.format;
  };

  durationInputs.forEach((input) => {
    input.addEventListener("change", () => {
      state.duration = Number(input.value);
      loadAvailability();
    });
  });

  formatInputs.forEach((input) => input.addEventListener("change", updateFormat));

  previousWeek.addEventListener("click", () => {
    if (state.weekOffset <= minWeekOffset) return;
    state.weekOffset -= 1;
    loadAvailability();
  });

  nextWeek.addEventListener("click", () => {
    if (state.weekOffset >= maxWeekOffset) return;
    state.weekOffset += 1;
    loadAvailability();
  });

  form.addEventListener("submit", (event) => {
    if (!state.selectedSlot || !endpoint) {
      event.preventDefault();
      formError.textContent = "Choose an available time before confirming the booking.";
      formError.hidden = false;
      return;
    }

    form.action = endpoint;
    formError.hidden = true;
    submit.disabled = true;
    submit.textContent = "Confirming…";
    window.clearTimeout(state.submitTimer);
    state.submitTimer = window.setTimeout(() => {
      submit.disabled = false;
      submit.textContent = "Confirm booking";
      formError.textContent = "The booking took too long to confirm. Your time has not been reserved; please try again.";
      formError.hidden = false;
    }, 20_000);
  });

  window.addEventListener("message", (event) => {
    const trustedOrigin = event.origin === "https://script.google.com"
      || event.origin.endsWith(".googleusercontent.com");
    if (!trustedOrigin || event.data?.source !== "andrew-booking") return;

    window.clearTimeout(state.submitTimer);
    submit.disabled = false;
    submit.textContent = "Confirm booking";

    if (!event.data.ok) {
      formError.textContent = event.data.message || "That time could not be booked. Refresh the calendar and try again.";
      formError.hidden = false;
      if (event.data.refresh) loadAvailability();
      return;
    }

    app.querySelector(".booking-week-nav").hidden = true;
    status.hidden = true;
    days.hidden = true;
    details.hidden = true;
    successCopy.textContent = `A calendar invitation has been sent to ${form.elements.email.value}.`;
    success.hidden = false;
  });

  bookAnother.addEventListener("click", () => {
    form.reset();
    durationInputs[0].checked = true;
    formatInputs[0].checked = true;
    state.duration = 15;
    state.format = "online";
    app.querySelector(".booking-week-nav").hidden = false;
    loadAvailability();
  });

  loadAvailability();
})();
