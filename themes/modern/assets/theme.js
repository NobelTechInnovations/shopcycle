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
