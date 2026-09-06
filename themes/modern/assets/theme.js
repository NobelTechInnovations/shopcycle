// Modern theme — client-side behavior.
document.addEventListener("DOMContentLoaded", () => {
  console.info("[shopcycle] modern theme loaded");
  initScrollReveal();
  initCountdowns();
  initHeroCarousels();
});

/**
 * Soft fade-up-on-scroll for every section — this is Modern's "premium,
 * rich" feel the Classic theme doesn't have. Targets the section wrapper
 * `[data-section-id]` div the engine already emits around every section in
 * every theme (see liquid-engine.js / render-template.js), so no markup
 * changes were needed in any individual section to opt in. Respects
 * prefers-reduced-motion by skipping the animation entirely — the content
 * is still shown immediately, never hidden waiting on motion a visitor
 * has asked their OS to avoid.
 */
function initScrollReveal() {
  const sections = document.querySelectorAll("[data-section-id]");
  if (sections.length === 0) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    sections.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  sections.forEach((el) => el.classList.add("reveal"));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
  );

  sections.forEach((el) => observer.observe(el));

  // The very first section (usually the hero) is visible on load with no
  // scrolling involved — reveal it immediately instead of making a visitor
  // wait for a scroll event that may never come above the fold.
  const first = sections[0];
  if (first && first.getBoundingClientRect().top < window.innerHeight) {
    first.classList.add("is-visible");
    observer.unobserve(first);
  }
}

/**
 * Every countdown on the page is driven the same way: a
 * `data-countdown-minutes` attribute sets how long the countdown runs
 * *from this page load* — there's no stored "sale ends at" timestamp in
 * the data model, so this is an honest "N minutes from now," not a fake
 * fixed date that would silently relapse to 00:00:00:00.
 */
function initCountdowns() {
  const nodes = document.querySelectorAll("[data-countdown-minutes]");
  if (nodes.length === 0) return;

  nodes.forEach((node) => {
    const minutes = Number(node.dataset.countdownMinutes) || 0;
    const endsAt = Date.now() + minutes * 60 * 1000;
    render(node, endsAt);
    const id = setInterval(() => {
      if (!render(node, endsAt)) clearInterval(id);
    }, 1000);
  });
}

function render(node, endsAt) {
  const remainingMs = Math.max(0, endsAt - Date.now());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");

  const days_el = node.querySelector(".js-cd-days");
  if (days_el) {
    days_el.textContent = pad(days);
    node.querySelector(".js-cd-hours").textContent = pad(hours);
    node.querySelector(".js-cd-mins").textContent = pad(mins);
    node.querySelector(".js-cd-secs").textContent = pad(secs);
  } else {
    node.textContent = `${pad(days)}d : ${pad(hours)}h : ${pad(mins)}m : ${pad(secs)}s`;
  }

  return remainingMs > 0;
}

/**
 * Hero banner carousel — only active on sections with more than one
 * `[data-hero-slide]`. Real previous/next navigation and dot pagination,
 * plus autoplay that pauses on hover.
 */
function initHeroCarousels() {
  document.querySelectorAll("[data-hero]").forEach((hero) => {
    const slides = Array.from(hero.querySelectorAll("[data-hero-slide]"));
    if (slides.length <= 1) return;

    const dots = Array.from(hero.querySelectorAll("[data-hero-dot]"));
    const autoplay = hero.dataset.autoplay === "true";
    const speedMs = (Number(hero.dataset.autoplaySpeed) || 6) * 1000;
    let index = 0;
    let timer = null;

    function show(next) {
      slides[index].classList.remove("is-active");
      dots[index] && dots[index].classList.remove("is-active");
      index = (next + slides.length) % slides.length;
      slides[index].classList.add("is-active");
      dots[index] && dots[index].classList.add("is-active");
    }

    function restart() {
      clearInterval(timer);
      if (autoplay) timer = setInterval(() => show(index + 1), speedMs);
    }

    hero.querySelector("[data-hero-prev]")?.addEventListener("click", () => {
      show(index - 1);
      restart();
    });
    hero.querySelector("[data-hero-next]")?.addEventListener("click", () => {
      show(index + 1);
      restart();
    });
    dots.forEach((dot, i) => {
      dot.addEventListener("click", () => {
        show(i);
        restart();
      });
    });

    hero.addEventListener("mouseenter", () => clearInterval(timer));
    hero.addEventListener("mouseleave", restart);
    restart();
  });
}
