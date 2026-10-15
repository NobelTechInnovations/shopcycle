/* Modern theme — small progressive enhancements. Everything works without
   this file (menus and search are <details>, forms post normally); this
   adds the scroll behaviour, closing on Escape, and slider buttons. */
(function () {
  "use strict";

  // ── Header: solid once you scroll past the hero's top ───────────────
  var header = document.querySelector("[data-header]");
  var announce = document.querySelector(".announce");
  function syncHeader() {
    if (!header) return;
    var offset = announce ? announce.offsetHeight : 0;
    document.documentElement.style.setProperty("--announce-h", Math.max(0, offset - window.scrollY) + "px");
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  if (header) {
    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });
    window.addEventListener("resize", syncHeader);
  }

  // ── Rotating announcements ──────────────────────────────────────────
  document.querySelectorAll("[data-announce]").forEach(function (box) {
    var msgs = box.querySelectorAll(".announce__msg");
    if (msgs.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var i = 0;
    var timer = setInterval(next, 4500);
    function next() {
      msgs[i].classList.remove("is-active");
      i = (i + 1) % msgs.length;
      msgs[i].classList.add("is-active");
    }
    box.addEventListener("mouseenter", function () {
      clearInterval(timer);
    });
    box.addEventListener("mouseleave", function () {
      timer = setInterval(next, 4500);
    });
  });

  // ── Menu drawer and search panel ────────────────────────────────────
  var drawer = document.querySelector("[data-drawer]");
  var search = document.querySelector("[data-search]");
  function closeAll() {
    if (drawer) drawer.open = false;
    if (search) search.open = false;
  }
  if (drawer) {
    drawer.addEventListener("toggle", function () {
      document.documentElement.style.overflow = drawer.open ? "hidden" : "";
      if (drawer.open && search) search.open = false;
    });
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("[data-drawer-close]") || e.target === drawer) drawer.open = false;
      // Clicking the dimmed backdrop (the ::before of <details>) lands on the element itself.
    });
    document.addEventListener("click", function (e) {
      if (drawer.open && !e.target.closest(".drawer__panel") && !e.target.closest(".drawer__toggle")) drawer.open = false;
    });
  }
  if (search) {
    search.addEventListener("toggle", function () {
      if (search.open) {
        var input = search.querySelector("input[type=search]");
        if (input) setTimeout(function () { input.focus(); }, 30);
      }
    });
    document.addEventListener("click", function (e) {
      if (search.open && !search.contains(e.target)) search.open = false;
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAll();
  });

  // ── Sliders (testimonials) ──────────────────────────────────────────
  document.querySelectorAll("[data-slider]").forEach(function (track) {
    var nav = track.parentNode.querySelector("[data-slider-nav]");
    if (!nav) return;
    nav.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-slide]");
      if (!btn) return;
      var card = track.firstElementChild;
      var step = card ? card.getBoundingClientRect().width + 18 : track.clientWidth;
      track.scrollBy({ left: Number(btn.getAttribute("data-slide")) * step, behavior: "smooth" });
    });
  });
})();

// ── Extra sections ───────────────────────────────────────────────────
(function () {
  // Deal countdown: to data-end, else to midnight every day.
  document.querySelectorAll("[data-x-countdown]").forEach(function (el) {
    var raw = (el.getAttribute("data-end") || "").trim();
    var fixed = raw ? new Date(raw.replace(" ", "T")) : null;
    if (fixed && isNaN(fixed.getTime())) fixed = null;
    var pad = function (n) { return String(n).padStart(2, "0"); };
    function tick() {
      var now = new Date();
      var end = fixed || new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      var left = Math.max(0, Math.floor((end - now) / 1000));
      if (fixed && left === 0) { el.closest("section").hidden = true; return; }
      el.querySelector("[data-d]").textContent = pad(Math.floor(left / 86400));
      el.querySelector("[data-h]").textContent = pad(Math.floor((left % 86400) / 3600));
      el.querySelector("[data-m]").textContent = pad(Math.floor((left % 3600) / 60));
      el.querySelector("[data-s]").textContent = pad(left % 60);
    }
    tick();
    setInterval(tick, 1000);
  });
  // Product hero: thumbnails swap the main photo.
  document.querySelectorAll("[data-x-thumb]").forEach(function (b) {
    b.addEventListener("click", function () {
      var main = b.closest(".x-ph__gallery").querySelector("[data-x-main]");
      if (main) main.src = b.getAttribute("data-x-thumb");
    });
  });
  // Sticky buy bar: shows once the product hero is out of view.
  var bar = document.querySelector("[data-x-sticky]");
  var hero = document.getElementById("buy");
  if (bar && hero && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      var off = !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0;
      bar.classList.toggle("is-on", off);
      bar.setAttribute("aria-hidden", off ? "false" : "true");
      var link = bar.querySelector("a");
      if (link) link.tabIndex = off ? 0 : -1;
    }).observe(hero);
  }
})();
