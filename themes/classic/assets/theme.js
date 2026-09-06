// Classic theme — client-side behavior.
document.addEventListener("DOMContentLoaded", () => {
  console.info("[shopcycle] classic theme loaded");
  initCountdowns();
  initHeroCarousels();
});

/**
 * Hero banner carousel — only wired up on sections with more than one
 * `[data-hero-slide]` (a single-slide hero has no arrows/dots in the markup
 * at all, so this simply finds nothing there and does nothing). Real
 * previous/next navigation and dot pagination, plus a slow autoplay that
 * pauses on hover — not a decorative sliver of JS, an actual carousel.
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

/**
 * Every countdown on the page (product-card badges, the promo-split
 * feature panel) is driven the same way: a `data-countdown-minutes`
 * attribute sets how long the countdown runs *from this page load* — there's
 * no stored "sale ends at" timestamp in the data model, so this is an
 * honest "N minutes from now," not a fake fixed date that would silently
 * relapse to 00:00:00:00 for a shopper who loads the page after it "ends."
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

  // The promo-split feature panel has four separate labelled cells;
  // everything else (product-card badge) is a single compact string.
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
