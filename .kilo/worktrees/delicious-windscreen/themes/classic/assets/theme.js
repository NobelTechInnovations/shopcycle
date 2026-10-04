/*
 * Classic theme — progressive enhancement. Everything works without it
 * (links, forms, <details> menus); this adds the slideshow, rotating
 * announcements, tabs, the countdown and small header niceties.
 */
(function () {
  "use strict";
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Slideshow ─────────────────────────────────────────
  document.querySelectorAll("[data-slideshow]").forEach(function (root) {
    var slides = Array.prototype.slice.call(root.querySelectorAll("[data-slide]"));
    if (slides.length < 2) return;
    var dots = Array.prototype.slice.call(root.querySelectorAll("[data-slide-dot]"));
    var index = 0;
    var timer = null;
    var autoplay = root.getAttribute("data-autoplay") === "true" && !reduceMotion;
    var speed = (Number(root.getAttribute("data-speed")) || 6) * 1000;

    function show(next) {
      slides[index].classList.remove("is-active");
      slides[index].setAttribute("aria-hidden", "true");
      if (dots[index]) dots[index].classList.remove("is-active");
      index = (next + slides.length) % slides.length;
      slides[index].classList.add("is-active");
      slides[index].removeAttribute("aria-hidden");
      if (dots[index]) dots[index].classList.add("is-active");
    }
    function start() {
      stop();
      if (autoplay) timer = setInterval(function () { show(index + 1); }, speed);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    var prev = root.querySelector("[data-slide-prev]");
    var next = root.querySelector("[data-slide-next]");
    if (prev) prev.addEventListener("click", function () { show(index - 1); start(); });
    if (next) next.addEventListener("click", function () { show(index + 1); start(); });
    dots.forEach(function (dot, i) {
      dot.addEventListener("click", function () { show(i); start(); });
    });

    // Swipe on touch screens.
    var startX = null;
    root.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
    root.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 45) { show(index + (dx < 0 ? 1 : -1)); start(); }
      startX = null;
    });

    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);
    root.addEventListener("focusin", stop);
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
    start();
  });

  // ── Announcement bar ──────────────────────────────────
  document.querySelectorAll("[data-announce]").forEach(function (bar) {
    var msgs = bar.querySelectorAll("[data-announce-msg]");
    if (msgs.length < 2 || reduceMotion) return;
    var i = 0;
    setInterval(function () {
      msgs[i].classList.remove("is-active");
      i = (i + 1) % msgs.length;
      msgs[i].classList.add("is-active");
    }, 4500);
  });

  // ── Header ────────────────────────────────────────────
  var header = document.querySelector("[data-header]");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  document.querySelectorAll("[data-drawer]").forEach(function (drawer) {
    var close = drawer.querySelector("[data-drawer-close]");
    if (close) close.addEventListener("click", function () { drawer.removeAttribute("open"); });
    drawer.addEventListener("click", function (e) {
      // Tapping the dimmed area outside the panel closes the menu.
      if (e.target === drawer) drawer.removeAttribute("open");
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll("details[data-drawer][open], details[data-search][open]").forEach(function (d) { d.removeAttribute("open"); });
  });
  document.querySelectorAll("[data-search]").forEach(function (search) {
    search.addEventListener("toggle", function () {
      if (search.open) {
        var input = search.querySelector("input");
        if (input) setTimeout(function () { input.focus(); }, 30);
      }
    });
  });

  // ── Tabs ──────────────────────────────────────────────
  document.querySelectorAll("[data-tabs]").forEach(function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll("[data-tab]"));
    var panels = root.querySelectorAll("[data-panel]");
    if (tabs.length < 2) return;
    root.classList.add("is-ready");
    function select(i) {
      tabs.forEach(function (t, j) {
        t.classList.toggle("is-active", i === j);
        t.setAttribute("aria-selected", i === j ? "true" : "false");
        t.tabIndex = i === j ? 0 : -1;
      });
      panels.forEach(function (p, j) { p.classList.toggle("is-active", i === j); });
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { select(i); });
      tab.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          var n = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          select(n);
          tabs[n].focus();
        }
      });
    });
    select(0);
  });

  // ── Countdown to a real end date (IST) ────────────────
  document.querySelectorAll("[data-countdown]").forEach(function (el) {
    var raw = el.getAttribute("data-countdown").trim().replace(" ", "T");
    var end = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : raw + (raw.length <= 16 ? ":00+05:30" : "+05:30"));
    if (!end || end <= Date.now()) return; // no date, or the offer is over — stay hidden
    el.hidden = false;
    var parts = { d: el.querySelector("[data-d]"), h: el.querySelector("[data-h]"), m: el.querySelector("[data-m]"), s: el.querySelector("[data-s]") };
    function tick() {
      var left = Math.max(0, end - Date.now());
      if (left === 0) { el.hidden = true; return; }
      var s = Math.floor(left / 1000);
      parts.d.textContent = Math.floor(s / 86400);
      parts.h.textContent = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
      parts.m.textContent = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      parts.s.textContent = String(s % 60).padStart(2, "0");
      setTimeout(tick, 1000);
    }
    tick();
  });
})();
