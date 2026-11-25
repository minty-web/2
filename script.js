/* Gridhaul — interactions
   Live dashboard simulation, savings calculator, billing toggle, FAQ,
   pointer glow and reveal-on-scroll. No dependencies. */

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gbp = (value, digits = 0) =>
    "£" + value.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

  /* ------------------------------------------------------- header + nav */

  const header = document.querySelector("[data-header]");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");

  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const setNav = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("nav-open", open);
  };
  toggle.addEventListener("click", () => setNav(toggle.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setNav(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("nav-open")) {
      setNav(false);
      toggle.focus();
    }
  });

  /* ------------------------------------------------- dashboard simulation */

  const dash = document.querySelector(".dash");
  const vanEls = [...document.querySelectorAll("[data-vans] .van")];
  const loadEl = document.querySelector("[data-load]");
  const loadBar = document.querySelector("[data-load-bar]");
  const energyEl = document.querySelector("[data-energy]");
  const readyEl = document.querySelector("[data-ready]");
  const clockEl = document.querySelector("[data-clock]");

  const MAX_CHARGING = 3;
  const GRID_LIMIT = 400;
  const READY_OFFSCREEN = 17; // vans outside the visible list that are already ready
  const CHIP = {
    charging: ["chip chip-charging", "Charging"],
    queued: ["chip chip-queued", "Queued"],
    ready: ["chip chip-ready", "Ready"],
  };

  let energy = 1284;
  const vans = vanEls.map((el) => ({
    el,
    start: Number(el.dataset.charge),
    pct: Number(el.dataset.charge),
    state: Number(el.dataset.charge) >= 100 ? "ready" : el.hasAttribute("data-queued") ? "queued" : "charging",
  }));
  const initialStates = vans.map((van) => van.state);

  function renderVan(van) {
    const { el } = van;
    el.dataset.state = van.state;
    el.querySelector(".van-bar span").style.setProperty("--pct", `${van.pct}%`);
    el.querySelector(".van-pct").textContent = `${Math.round(van.pct)}%`;
    const chip = el.querySelector(".chip");
    [chip.className, chip.textContent] = CHIP[van.state];
  }

  function renderTotals() {
    const charging = vans.filter((van) => van.state === "charging").length;
    const load = Math.min(GRID_LIMIT - 4, 28 + charging * (96 + Math.random() * 12));
    loadEl.textContent = String(Math.round(load));
    loadBar.style.width = `${(load / GRID_LIMIT) * 100}%`;
    energyEl.textContent = Math.round(energy).toLocaleString("en-GB");
    readyEl.textContent = String(READY_OFFSCREEN + vans.filter((van) => van.state === "ready").length);
  }

  function renderClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function tick() {
    vans.forEach((van) => {
      if (van.state !== "charging") return;
      const step = 1.5 + Math.random() * 3.5;
      const next = Math.min(100, van.pct + step);
      energy += (next - van.pct) * 0.75; // ~75 kWh battery: 1% ≈ 0.75 kWh
      van.pct = next;
      if (van.pct >= 100) {
        van.state = "ready";
        van.el.classList.add("just-ready");
        window.setTimeout(() => van.el.classList.remove("just-ready"), 1600);
      }
    });

    // A free charger picks up the next queued van.
    const charging = vans.filter((van) => van.state === "charging").length;
    const queued = vans.find((van) => van.state === "queued");
    if (charging < MAX_CHARGING && queued) queued.state = "charging";

    vans.forEach(renderVan);
    renderTotals();

    // When every van is ready, start a fresh night after a short pause.
    if (vans.every((van) => van.state === "ready")) {
      window.clearInterval(timer);
      timer = null;
      window.setTimeout(() => {
        vans.forEach((van, i) => {
          van.pct = Math.min(92, Math.max(12, van.start - 25 + Math.random() * 20));
          van.state = initialStates[i] === "ready" ? "charging" : initialStates[i];
        });
        vans.forEach(renderVan);
        startSimulation();
      }, 3500);
    }
  }

  let timer = null;
  function startSimulation() {
    if (!timer && !reduceMotion) timer = window.setInterval(tick, 1400);
  }
  function stopSimulation() {
    window.clearInterval(timer);
    timer = null;
  }

  vans.forEach(renderVan);
  renderTotals();
  renderClock();
  window.setInterval(renderClock, 30 * 1000);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => (entry.isIntersecting ? startSimulation() : stopSimulation())).observe(dash);
  } else {
    startSimulation();
  }

  /* ---------------------------------------------------- savings calculator */

  const calc = document.querySelector("[data-calc]");
  const outputs = {
    vans: calc.querySelector('[data-out="vans"]'),
    km: calc.querySelector('[data-out="km"]'),
    price: calc.querySelector('[data-out="price"]'),
    diesel: calc.querySelector('[data-out="diesel"]'),
  };
  const results = {
    monthly: document.querySelector('[data-result="monthly"]'),
    yearly: document.querySelector('[data-result="yearly"]'),
    smart: document.querySelector('[data-result="smart"]'),
    co2: document.querySelector('[data-result="co2"]'),
  };

  const DAYS_PER_MONTH = 26;
  const DIESEL_L_PER_KM = 0.095;
  const EV_KWH_PER_KM = 0.28;
  const SMART_SAVING = 0.22;
  const CO2_PER_LITRE = 2.68; // kg
  const CO2_PER_KWH = 0.19; // kg, average grid mix

  let shownMonthly = 0;
  let tween = 0;

  function animateMonthly(target) {
    cancelAnimationFrame(tween);
    if (reduceMotion) {
      shownMonthly = target;
      results.monthly.textContent = gbp(target);
      return;
    }
    const from = shownMonthly;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / 450, 1);
      shownMonthly = from + (target - from) * (1 - Math.pow(1 - t, 3));
      results.monthly.textContent = gbp(Math.max(0, shownMonthly));
      if (t < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  }

  function updateCalculator() {
    const vansCount = Number(calc.elements.vans.value);
    const km = Number(calc.elements.km.value);
    const pence = Number(calc.elements.price.value);
    const diesel = Number(calc.elements.diesel.value);

    outputs.vans.textContent = String(vansCount);
    outputs.km.textContent = `${km} km`;
    outputs.price.textContent = `${pence}p / kWh`;
    outputs.diesel.textContent = `${gbp(diesel, 2)} / litre`;

    calc.elements.vans.setAttribute("aria-valuetext", `${vansCount} vans`);
    calc.elements.km.setAttribute("aria-valuetext", `${km} kilometres per day`);
    calc.elements.price.setAttribute("aria-valuetext", `${pence} pence per kilowatt hour`);
    calc.elements.diesel.setAttribute("aria-valuetext", `${gbp(diesel, 2)} per litre`);

    calc.querySelectorAll('input[type="range"]').forEach((input) => {
      const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
      input.style.setProperty("--fill", `${pct}%`);
    });

    const kmPerMonth = vansCount * km * DAYS_PER_MONTH;
    const dieselCost = kmPerMonth * DIESEL_L_PER_KM * diesel;
    const evCost = kmPerMonth * EV_KWH_PER_KM * (pence / 100);
    const smartCost = evCost * (1 - SMART_SAVING);
    const monthly = dieselCost - smartCost;
    const co2Tonnes =
      (kmPerMonth * 12 * (DIESEL_L_PER_KM * CO2_PER_LITRE - EV_KWH_PER_KM * CO2_PER_KWH)) / 1000;

    animateMonthly(monthly);
    results.yearly.textContent = gbp(monthly * 12);
    results.smart.textContent = `${gbp(evCost - smartCost)} / mo`;
    results.co2.textContent = `${Math.round(co2Tonnes).toLocaleString("en-GB")} t`;
  }

  calc.addEventListener("input", updateCalculator);
  calc.addEventListener("submit", (event) => event.preventDefault());
  updateCalculator();

  /* -------------------------------------------------------- billing toggle */

  const billingSwitch = document.querySelector("[data-billing]");
  const monthlyLabel = document.getElementById("bill-monthly");
  const yearlyLabel = document.getElementById("bill-yearly");

  function setBilling(yearly) {
    billingSwitch.setAttribute("aria-checked", String(yearly));
    monthlyLabel.classList.toggle("is-active", !yearly);
    yearlyLabel.classList.toggle("is-active", yearly);

    document.querySelectorAll(".price[data-monthly]").forEach((price) => {
      const value = Number(yearly ? price.dataset.yearly : price.dataset.monthly);
      price.textContent = gbp(value, Number.isInteger(value) ? 0 : 2);
      price.classList.remove("pop");
      void price.offsetWidth;
      price.classList.add("pop");
      const per = price.parentElement.querySelector(".per");
      per.textContent = yearly ? "per charger / month, billed yearly" : "per charger / month";
    });
  }

  billingSwitch.addEventListener("click", () => setBilling(billingSwitch.getAttribute("aria-checked") !== "true"));
  monthlyLabel.addEventListener("click", () => setBilling(false));
  yearlyLabel.addEventListener("click", () => setBilling(true));

  /* -------------------------------------------------------------- FAQ */

  document.querySelectorAll(".acc-trigger").forEach((trigger, index) => {
    const panel = document.getElementById(trigger.getAttribute("aria-controls"));
    const set = (open) => {
      trigger.setAttribute("aria-expanded", String(open));
      panel.classList.toggle("is-open", open);
    };
    trigger.addEventListener("click", () => set(trigger.getAttribute("aria-expanded") !== "true"));
    if (index === 0) set(true);
  });

  /* ------------------------------------------------------- pointer glow */

  document.querySelectorAll("[data-glow]").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    });
  });

  /* ------------------------------------------------------------ pilot form */

  const pilot = document.querySelector("[data-pilot]");
  const pilotMsg = document.getElementById("pilot-msg");

  pilot.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = pilot.elements.email;
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
    input.setAttribute("aria-invalid", String(!valid));
    pilotMsg.classList.toggle("is-error", !valid);
    pilotMsg.classList.toggle("is-success", valid);
    if (!valid) {
      pilotMsg.textContent = "Please enter a valid work email.";
      input.focus();
      return;
    }
    pilotMsg.textContent = "Thanks! This is a concept site, so nothing was sent and nobody will call you.";
    pilot.reset();
  });

  /* ------------------------------------------------ reveal + count-ups */

  function countUp(el) {
    const target = Number(el.dataset.count);
    const decimals = Number(el.dataset.decimals || 0);
    if (reduceMotion) return;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / 1400, 1);
      el.textContent = (target * (1 - Math.pow(1 - t, 3))).toFixed(decimals);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const targets = document.querySelectorAll("[data-reveal], .stats-grid");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          entry.target.querySelectorAll("[data-count]").forEach(countUp);
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    targets.forEach((el) => observer.observe(el));
  } else {
    targets.forEach((el) => el.classList.add("is-visible"));
  }

  const year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
})();
