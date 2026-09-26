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
        button.textContent = v.available ? data.labels.add : data.labels.soldOut;
      }
      if (selectedLabel) selectedLabel.textContent = v.title;
    }

    form.querySelectorAll('input[name="variantId"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        render(radio.value);
      });
    });
  });

  // ── Auto-submitting selects (collection sort) ──────────
  document.querySelectorAll("[data-sys-autosubmit]").forEach(function (el) {
    el.addEventListener("change", function () {
      if (el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
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
