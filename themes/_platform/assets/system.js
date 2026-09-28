/*
 * Oyklane platform pages — progressive enhancement only. Every form here
 * works without JavaScript (plain POST/redirect/GET); this script just
 * makes it nicer: gallery thumbnails, variant switching that keeps price,
 * stock and the add-to-cart button in sync, quantity steppers, sorting
 * without a submit button, and one-click-only checkout.
 */
(function () {
  "use strict";

  function money(amount, currency) {
    try {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR" }).format(amount);
    } catch (e) {
      return String(amount);
    }
  }

  // ── Gallery ────────────────────────────────────────────
  document.querySelectorAll("[data-sys-gallery]").forEach(function (gallery) {
    var main = gallery.querySelector("[data-sys-gallery-main]");
    if (!main) return;
    gallery.querySelectorAll("[data-sys-thumb]").forEach(function (thumb) {
      thumb.addEventListener("click", function () {
        main.src = thumb.getAttribute("data-src");
        main.alt = thumb.getAttribute("data-alt") || main.alt;
        gallery.querySelectorAll("[data-sys-thumb]").forEach(function (t) {
          t.setAttribute("aria-current", t === thumb ? "true" : "false");
        });
      });
    });
  });

  // ── Quantity steppers ──────────────────────────────────
  document.querySelectorAll("[data-sys-qty]").forEach(function (wrap) {
    var input = wrap.querySelector("input");
    if (!input) return;
    wrap.querySelectorAll("[data-step]").forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        // Cart steppers are real submit buttons; only product-page ones
        // (type="button") are handled here.
        if (btn.type !== "button") return;
        event.preventDefault();
        var min = Number(input.min || 1);
        var max = Number(input.max || 999);
        var next = Math.min(max, Math.max(min, Number(input.value || 1) + Number(btn.getAttribute("data-step"))));
        input.value = String(next);
      });
    });
  });

  // ── Variant picker ─────────────────────────────────────
  document.querySelectorAll("[data-sys-product]").forEach(function (form) {
    var dataEl = document.querySelector("[data-sys-product-json]");
    if (!dataEl) return;
    var data;
    try {
      data = JSON.parse(dataEl.textContent);
    } catch (e) {
      return;
    }
    var priceEl = document.querySelector("[data-sys-price]");
    var stockEl = document.querySelector("[data-sys-stock]");
    var button = form.querySelector("[data-sys-add]");
    var selectedLabel = document.querySelector("[data-sys-selected]");

    function render(variantId) {
      var v = data.variants.filter(function (x) {
        return x.id === variantId;
      })[0];
      if (!v) return;
      if (priceEl) {
        var onSale = v.comparePrice && v.comparePrice > v.price;
        var html = '<span class="sys-price__now' + (onSale ? " sys-price__now--sale" : "") + '">' + money(v.price, data.currency) + "</span>";
        if (onSale) {
          var pct = Math.round(((v.comparePrice - v.price) / v.comparePrice) * 100);
          html += '<span class="sys-price__was">' + money(v.comparePrice, data.currency) + "</span>";
          html += '<span class="sys-price__save">SAVE ' + pct + "%</span>";
        }
        priceEl.innerHTML = html;
      }
      if (stockEl) {
        var q = v.inventoryQuantity;
        stockEl.className = "sys-stock" + (q <= 0 ? " sys-stock--out" : q <= data.lowStock ? " sys-stock--low" : "");
        stockEl.textContent = q <= 0 ? "Out of stock" : q <= data.lowStock ? "Only " + q + " left — order soon" : "In stock, ready to ship";
      }
      if (button) {
        button.disabled = !v.available;
        button.textContent = v.available ? button.getAttribute("data-label") || data.labels.add : data.labels.soldOut;
      }
      if (selectedLabel) selectedLabel.textContent = v.title;
    }

    form.querySelectorAll('input[type="radio"][name="variantId"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        render(radio.value);
      });
    });

    // Separate pickers (Size, Colour…): the chosen values make a title
    // like "M / Black", which picks the variant.
    var hidden = form.querySelector("[data-sys-variant-input]");
    var groups = Array.prototype.slice.call(form.querySelectorAll("[data-sys-option]"));
    if (!hidden || !groups.length) return;
    hidden.disabled = false;
    var parts = function (v) {
      return v.title.split(" / ").map(function (s) {
        return s.trim();
      });
    };
    function chosen() {
      return groups.map(function (g) {
        var r = g.querySelector("input:checked");
        return r ? r.value : null;
      });
    }
    function sync() {
      var picks = chosen();
      var match = data.variants.filter(function (v) {
        var p = parts(v);
        return picks.every(function (val, i) {
          return p[i] === val;
        });
      })[0];
      groups.forEach(function (g, i) {
        var label = g.querySelector("[data-sys-option-selected]");
        if (label) label.textContent = picks[i] || "";
        // Strike through values with nothing in stock alongside the other picks.
        g.querySelectorAll("input").forEach(function (input) {
          var trial = picks.slice();
          trial[i] = input.value;
          var ok = data.variants.some(function (v) {
            var p = parts(v);
            return v.available && trial.every(function (val, k) {
              return p[k] === val;
            });
          });
          input.closest(".sys-swatch").classList.toggle("sys-swatch--unavailable", !ok);
        });
      });
      if (match) {
        hidden.value = match.id;
        render(match.id);
        if (selectedLabel) selectedLabel.textContent = match.title;
        showPhotoFor(picks);
      } else if (button) {
        button.disabled = true;
        button.textContent = "Unavailable";
        if (stockEl) {
          stockEl.className = "sys-stock sys-stock--out";
          stockEl.textContent = "This combination isn't available";
        }
      }
    }
    // Choosing a colour (or any value named in a photo's description, e.g.
    // "Pure Linen Shirt in Olive") brings that photo up in the gallery.
    var thumbs = Array.prototype.slice.call(document.querySelectorAll("[data-sys-thumb]"));
    var lastShown = null;
    function showPhotoFor(picks) {
      var key = picks.join("|");
      if (!thumbs.length || key === lastShown) return;
      lastShown = key;
      for (var i = picks.length - 1; i >= 0; i -= 1) {
        var want = String(picks[i] || "").toLowerCase();
        if (!want) continue;
        var hit = thumbs.filter(function (t) {
          return new RegExp("\\b" + want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(String(t.getAttribute("data-alt") || "").toLowerCase());
        })[0];
        if (hit) {
          if (hit.getAttribute("aria-current") !== "true") hit.click();
          return;
        }
      }
    }
    groups.forEach(function (g) {
      g.addEventListener("change", sync);
    });
    sync();
  });

  // ── Account tabs ───────────────────────────────────────
  // The account page's Orders / Details / Password parts become tabs. The
  // tab a form was sent from reopens after the page comes back (with its
  // "saved" or error message); a #details link opens that tab.
  document.querySelectorAll("[data-sys-tabs]").forEach(function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll("[data-sys-tab]"));
    var panels = {};
    tabs.forEach(function (t) {
      panels[t.getAttribute("data-sys-tab")] = document.querySelector('[data-sys-panel="' + t.getAttribute("data-sys-tab") + '"]');
    });
    var KEY = "oy-account-tab";
    function show(name, focus) {
      if (!panels[name]) name = tabs[0].getAttribute("data-sys-tab");
      tabs.forEach(function (t) {
        var on = t.getAttribute("data-sys-tab") === name;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
        panels[t.getAttribute("data-sys-tab")].hidden = !on;
      });
    }
    list.hidden = false;
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () {
        show(t.getAttribute("data-sys-tab"));
        if (history.replaceState) history.replaceState(null, "", "#" + t.getAttribute("data-sys-tab"));
      });
      t.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        show(next.getAttribute("data-sys-tab"), true);
      });
    });
    Object.keys(panels).forEach(function (name) {
      var form = panels[name] && panels[name].querySelector("form");
      if (form) form.addEventListener("submit", function () {
        try {
          sessionStorage.setItem(KEY, name);
        } catch (e) {}
      });
    });
    document.querySelectorAll("[data-sys-tab-link]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        show(a.getAttribute("data-sys-tab-link"));
        list.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    var start = (location.hash || "").slice(1);
    if (document.querySelector(".sys-acct .sys-alert")) {
      try {
        start = sessionStorage.getItem(KEY) || start;
      } catch (e) {}
    }
    try {
      sessionStorage.removeItem(KEY);
    } catch (e) {}
    show(start);
  });

  // ── Auto-submitting selects (collection sort) ──────────
  document.querySelectorAll("[data-sys-autosubmit]").forEach(function (el) {
    el.addEventListener("change", function () {
      if (el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
    });
  });

  // ── Listing filters: a sidebar on desktop (always open), folded behind a
  // "Filters" button on phones. Rendered open so it works without JS.
  document.querySelectorAll("[data-sys-filters]").forEach(function (panel) {
    if (window.matchMedia && window.matchMedia("(max-width: 900px)").matches) panel.open = false;
  });
  // Keep the address tidy: empty price boxes and the default sort stay out of it.
  var filterForm = document.getElementById("sys-filter-form");
  if (filterForm) {
    filterForm.addEventListener("submit", function () {
      Array.prototype.forEach.call(filterForm.elements, function (field) {
        if ((field.name === "price_min" || field.name === "price_max") && !field.value) field.disabled = true;
        if (field.name === "sort" && field.value === "featured") field.disabled = true;
      });
    });
  }

  // ── Show / hide password ───────────────────────────────
  document.querySelectorAll("[data-sys-reveal]").forEach(function (btn) {
    var input = btn.parentNode.querySelector("[data-sys-password]");
    if (!input) return;
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });

  // ── One submit only (checkout, account forms) ──────────
  document.querySelectorAll("[data-sys-once]").forEach(function (form) {
    form.addEventListener("submit", function () {
      var btn = form.querySelector('button[type="submit"]');
      if (!btn || btn.disabled) return;
      // Deferred so the browser still sends the form first.
      setTimeout(function () {
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        if (btn.getAttribute("data-busy-label")) btn.textContent = btn.getAttribute("data-busy-label");
      }, 0);
    });
  });
})();
