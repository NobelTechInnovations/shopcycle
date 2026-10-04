/*
 * Oyklane cart drawer — on when a theme's "Cart type" setting is "Drawer".
 * Add-to-cart forms and cart links keep working without JavaScript (they
 * post / link to the full cart page); this script upgrades them: adding
 * an item or opening the cart slides this panel in instead.
 * Config: <script type="application/json" id="oy-cart-config">.
 */
(function () {
  "use strict";
  var configEl = document.getElementById("oy-cart-config");
  if (!configEl) return;
  var cfg;
  try {
    cfg = JSON.parse(configEl.textContent);
  } catch (e) {
    return;
  }

  var pathOf = function (url) {
    try {
      return new URL(url, location.href).pathname.replace(/\/+$/, "");
    } catch (e) {
      return "";
    }
  };
  var ADD_PATH = pathOf(cfg.add);
  var CART_PATH = pathOf(cfg.cart);

  var money = function (value) {
    var n = Number(value) || 0;
    try {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: cfg.currency || "INR" }).format(n);
    } catch (e) {
      return (cfg.currency || "") + " " + n.toFixed(2);
    }
  };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var ICON = {
    x: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    minus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    bag: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
    photo: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5.5-5.5L3 20"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };

  // ── Markup ─────────────────────────────────────────────
  var root = document.createElement("div");
  root.className = "oy-drawer";
  root.hidden = true;
  root.innerHTML =
    '<div class="oy-drawer__scrim" data-oy-close></div>' +
    '<aside class="oy-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="oy-drawer-title" tabindex="-1">' +
    '<header class="oy-drawer__head"><h2 id="oy-drawer-title">Your cart</h2>' +
    '<button type="button" class="oy-drawer__close" data-oy-close aria-label="Close cart">' + ICON.x + "</button></header>" +
    '<div class="oy-drawer__notice" role="status" aria-live="polite"></div>' +
    '<div class="oy-drawer__body"></div>' +
    '<footer class="oy-drawer__foot"></footer>' +
    "</aside>";
  document.body.appendChild(root);
  var panel = root.querySelector(".oy-drawer__panel");
  var body = root.querySelector(".oy-drawer__body");
  var foot = root.querySelector(".oy-drawer__foot");
  var notice = root.querySelector(".oy-drawer__notice");
  var title = root.querySelector("#oy-drawer-title");
  var opener = null;
  var busy = false;

  function itemUrl(item) {
    // The API links items under /store/:handle; rebuild them under this
    // store's own root so they work on a custom domain too.
    var slug = String(item.url || "").split("/products/")[1];
    return slug ? cfg.root.replace(/\/$/, "") + "/products/" + slug : cfg.cart;
  }

  function render(cart) {
    var count = cart ? cart.item_count || 0 : 0;
    title.textContent = count ? "Your cart (" + count + ")" : "Your cart";
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = count;
      el.hidden = count === 0;
    });

    if (!cart || !cart.items || !cart.items.length) {
      body.innerHTML =
        '<div class="oy-drawer__empty">' + ICON.bag + "<p>Your cart is empty</p>" +
        '<a class="oy-btn" href="' + esc(cfg.shop) + '">Start shopping</a></div>';
      foot.innerHTML = "";
      foot.hidden = true;
      return;
    }

    var html = "";
    var threshold = Number(cfg.freeShippingAbove);
    if (threshold > 0) {
      var left = Math.max(0, threshold - Number(cart.subtotal || 0));
      var pct = Math.min(100, Math.round((Number(cart.subtotal || 0) / threshold) * 100));
      html +=
        '<div class="oy-drawer__ship">' +
        (left > 0 ? "You're <strong>" + money(left) + "</strong> away from free delivery" : ICON.check + " <strong>You've unlocked free delivery</strong>") +
        '<div class="oy-drawer__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div></div>';
    }
    html += '<ul class="oy-drawer__lines">';
    cart.items.forEach(function (item) {
      var url = esc(itemUrl(item));
      html +=
        '<li class="oy-line">' +
        '<a class="oy-line__media" href="' + url + '" tabindex="-1" aria-hidden="true">' +
        (item.image ? '<img src="' + esc(item.image) + '" alt="" loading="lazy" width="160" height="200">' : '<span class="oy-line__ph">' + ICON.photo + "</span>") +
        "</a>" +
        '<div class="oy-line__info">' +
        '<a class="oy-line__title" href="' + url + '">' + esc(item.title) + "</a>" +
        (item.detail ? '<span class="oy-line__detail">' + esc(item.detail) + "</span>" : "") +
        '<span class="oy-line__price">' + money(item.price) + "</span>" +
        '<div class="oy-line__row">' +
        '<div class="oy-qty" role="group" aria-label="Quantity of ' + esc(item.title) + '">' +
        '<button type="button" data-oy-qty="' + (item.quantity - 1) + '" data-variant="' + esc(item.variantId) + '" data-key="' + esc(item.key || "") + '" aria-label="Decrease quantity">' + ICON.minus + "</button>" +
        '<span aria-live="polite">' + item.quantity + "</span>" +
        '<button type="button" data-oy-qty="' + (item.quantity + 1) + '" data-variant="' + esc(item.variantId) + '" data-key="' + esc(item.key || "") + '" aria-label="Increase quantity">' + ICON.plus + "</button>" +
        "</div>" +
        '<button type="button" class="oy-line__remove" data-oy-qty="0" data-variant="' + esc(item.variantId) + '" data-key="' + esc(item.key || "") + '">Remove</button>' +
        "</div></div>" +
        '<strong class="oy-line__total">' + money(item.lineTotal) + "</strong>" +
        "</li>";
    });
    html += "</ul>";
    body.innerHTML = html;

    var rows = '<div class="oy-sum"><span>Subtotal</span><span>' + money(cart.subtotal) + "</span></div>";
    if (cart.discount && Number(cart.discount.amount) > 0) {
      rows += '<div class="oy-sum oy-sum--save"><span>Discount (' + esc(cart.discount.code) + ")</span><span>−" + money(cart.discount.amount) + "</span></div>";
    }
    foot.hidden = false;
    foot.innerHTML =
      rows +
      '<p class="oy-drawer__fine">Delivery and taxes are calculated at checkout.</p>' +
      (cfg.oneClick
        ? '<button type="button" class="oy-btn oy-btn--block" data-oy-oneclick>' + ICON.lock + " Checkout · " + money(cart.total) + "</button>"
        : '<a class="oy-btn oy-btn--block" href="' + esc(cfg.checkout) + '">' + ICON.lock + " Checkout · " + money(cart.total) + "</a>") +
      '<a class="oy-btn oy-btn--ghost oy-btn--block" href="' + esc(cfg.cart) + '" data-oy-full>View cart</a>';
    lastCart = cart;
  }
  var lastCart = null;

  // ── Open / close ───────────────────────────────────────
  function open() {
    if (!root.hidden) return;
    opener = document.activeElement;
    root.hidden = false;
    document.documentElement.classList.add("oy-drawer-open");
    requestAnimationFrame(function () {
      root.classList.add("is-open");
      panel.focus();
    });
  }
  function close() {
    if (root.hidden) return;
    root.classList.remove("is-open");
    document.documentElement.classList.remove("oy-drawer-open");
    setTimeout(function () {
      root.hidden = true;
      notice.textContent = "";
      notice.classList.remove("is-shown");
    }, 260);
    if (opener && opener.focus) opener.focus();
  }
  root.addEventListener("click", function (e) {
    if (e.target.closest("[data-oy-close]")) close();
  });
  document.addEventListener("keydown", function (e) {
    if (root.hidden || sheet) return; // the one-click popup handles its own keys
    if (e.key === "Escape") return close();
    if (e.key !== "Tab") return;
    // Keep focus inside the drawer while it's open.
    var focusable = panel.querySelectorAll('a[href],button:not([disabled]),[tabindex="0"]');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // ── Talking to the store ───────────────────────────────
  function request(url, form) {
    return fetch(url, {
      method: form ? "POST" : "GET",
      body: form || undefined,
      headers: { accept: "application/json" },
      credentials: "same-origin",
    }).then(function (res) {
      if (res.ok) return res.json();
      // The store answered but said no (sold out, not enough stock…):
      // carry its message so it can be shown instead of leaving the page.
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          var err = new Error((body && body.error) || "Couldn't update your cart.");
          err.status = res.status;
          throw err;
        });
    });
  }

  function showError(text) {
    notice.innerHTML = esc(text);
    notice.classList.add("is-shown", "is-error");
  }

  function showNotice(text) {
    notice.innerHTML = ICON.check + " " + esc(text);
    notice.classList.remove("is-error");
    notice.classList.add("is-shown");
  }

  // Add to cart: any form that posts to the store's add URL.
  document.addEventListener(
    "submit",
    function (e) {
      if (cfg.drawerOff) return;
      var form = e.target;
      var via = e.submitter && e.submitter.hasAttribute("formaction") ? e.submitter.formAction : form.action;
      if (!(form instanceof HTMLFormElement) || pathOf(via) !== ADD_PATH) return;
      e.preventDefault();
      // Stop other submit handlers (e.g. "disable while submitting") — the
      // page isn't navigating, so this script manages the button itself.
      e.stopImmediatePropagation();
      if (busy) return;
      var btn = e.submitter || form.querySelector('[type="submit"]');
      var label = btn ? btn.innerHTML : "";
      busy = true;
      if (btn) {
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        btn.classList.add("is-loading");
      }
      var data = new FormData(form);
      if (btn && btn.name) data.append(btn.name, btn.value);
      request(form.action, data)
        .then(function (res) {
          render(res.cart);
          open();
          var title = form.getAttribute("data-product-title") || "Item";
          showNotice(title + " added to your cart");
          // Facebook Pixel / Google Analytics (platform tracking.js), if installed.
          if (window.oyTrack) {
            var vid = data.get("variantId");
            var line = (res.cart.items || []).filter(function (i) {
              return i.variantId === vid;
            })[0];
            var qty = Number(data.get("quantity")) || 1;
            if (line) {
              window.oyTrack("AddToCart", {
                ids: [line.productId],
                name: line.title,
                value: Math.round(line.price * qty * 100) / 100,
                currency: cfg.currency,
                items: [{ item_id: line.productId, item_name: line.title, price: line.price, quantity: qty }],
              });
            }
          }
        })
        .catch(function (err) {
          if (err && err.status && err.status < 500 && err.status !== 404) {
            // A real answer from the store — show it in the drawer.
            return request(cfg.cartJson)
              .then(function (res) {
                render(res.cart);
              })
              .catch(function () {})
              .then(function () {
                open();
                showError(err.message);
              });
          }
          // No usable answer: fall back to the full-page flow.
          form.submit();
        })
        .then(function () {
          busy = false;
          if (btn) {
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
            btn.classList.remove("is-loading");
            btn.innerHTML = label;
          }
        });
    },
    true
  );

  // Cart links open the drawer (except the drawer's own "View cart").
  document.addEventListener("click", function (e) {
    if (cfg.drawerOff) return;
    var link = e.target.closest && e.target.closest("a[href]");
    if (!link || link.hasAttribute("data-oy-full") || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (pathOf(link.href) !== CART_PATH) return;
    e.preventDefault();
    open();
    body.setAttribute("aria-busy", "true");
    request(cfg.cartJson)
      .then(function (res) {
        render(res.cart);
      })
      .catch(function () {
        location.href = cfg.cart;
      })
      .then(function () {
        body.removeAttribute("aria-busy");
      });
  });

  // ── Quick add from product cards ───────────────────────
  // A card's "Quick add" / "Choose options" link goes to the product page;
  // with the drawer on it opens a size/colour picker here instead, and the
  // add itself goes through the add-to-cart handler above.
  var QUICK = "[data-oy-quick], a.pcard__quick-btn, a.card__quick-btn";
  var quick = null; // { product, currency, lowStock }

  function quickSlug(el) {
    var explicit = el.getAttribute("data-oy-quick");
    if (explicit) return explicit;
    var m = pathOf(el.href || "").match(/\/products\/([^/?#]+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function quickUrl(slug) {
    return cfg.root.replace(/\/$/, "") + "/products/" + encodeURIComponent(slug) + "/quick";
  }
  var parts = function (v) {
    return String(v.title || "").split(" / ").map(function (x) {
      return x.trim();
    });
  };

  function priceHtml(v) {
    var sale = v.comparePrice && v.comparePrice > v.price;
    return '<span class="oy-quick__now' + (sale ? " is-sale" : "") + '">' + money(v.price) + "</span>" + (sale ? "<s>" + money(v.comparePrice) + "</s>" : "");
  }

  function renderQuick(data, href) {
    var p = data.product;
    quick = data;
    title.textContent = "Quick add";
    var sel = p.variants.filter(function (v) {
      return v.id === p.selected_variant_id;
    })[0] || p.variants[0];
    var options = p.options && p.options.length ? p.options : null;
    var img = p.images[0];
    var html =
      '<div class="oy-quick">' +
      '<div class="oy-quick__top">' +
      '<a class="oy-quick__media" href="' + esc(href) + '" tabindex="-1" aria-hidden="true">' +
      (img ? '<img data-oy-qimg src="' + esc(img.url) + '" alt="" width="240" height="300">' : '<span class="oy-line__ph">' + ICON.photo + "</span>") +
      "</a>" +
      '<div class="oy-quick__info">' +
      (p.brand ? '<span class="oy-quick__brand">' + esc(p.brand) + "</span>" : "") +
      '<a class="oy-quick__title" href="' + esc(href) + '">' + esc(p.title) + "</a>" +
      '<div class="oy-quick__price" data-oy-qprice>' + priceHtml(sel) + "</div>" +
      '<a class="oy-quick__more" href="' + esc(href) + '">View full details</a>' +
      "</div></div>" +
      '<form method="post" action="' + esc(cfg.add) + '" class="oy-quick__form" data-product-title="' + esc(p.title) + '">' +
      '<input type="hidden" name="variantId" value="' + esc(sel.id) + '" data-oy-qvariant>' +
      '<input type="hidden" name="quantity" value="1">';
    if (options) {
      options.forEach(function (opt, i) {
        html += '<fieldset class="oy-opt" data-oy-opt="' + i + '"><legend>' + esc(opt.name) + ': <span data-oy-optval>' + esc(opt.selected) + "</span></legend><div class=\"oy-opt__values\">";
        opt.values.forEach(function (val) {
          html +=
            '<label class="oy-chip"><input type="radio" name="oyq' + i + '" value="' + esc(val.value) + '"' + (val.value === opt.selected ? " checked" : "") + ">" +
            "<span>" + (opt.is_colour && val.swatch ? '<i class="oy-chip__dot" style="background:' + esc(val.swatch) + '"></i>' : "") + esc(val.value) + "</span></label>";
        });
        html += "</div></fieldset>";
      });
    } else if (p.variants.length > 1) {
      html += '<fieldset class="oy-opt" data-oy-opt="0"><legend>Option: <span data-oy-optval>' + esc(sel.title) + '</span></legend><div class="oy-opt__values">';
      p.variants.forEach(function (v) {
        html += '<label class="oy-chip"><input type="radio" name="oyq0" value="' + esc(v.title) + '"' + (v.id === sel.id ? " checked" : "") + "><span>" + esc(v.title) + "</span></label>";
      });
      html += "</div></fieldset>";
    }
    html +=
      '<p class="oy-quick__stock" data-oy-qstock></p>' +
      '<button type="submit" class="oy-btn oy-btn--block" data-oy-qadd>Add to cart</button>' +
      "</form></div>";
    body.innerHTML = html;
    foot.hidden = true;
    foot.innerHTML = "";
    var form = body.querySelector(".oy-quick__form");
    form.addEventListener("change", function () {
      syncQuick(form, !!options);
    });
    syncQuick(form, !!options);
    var first = form.querySelector("input:checked") || form.querySelector("[data-oy-qadd]");
    if (first) first.focus();
  }

  function syncQuick(form, split) {
    var p = quick.product;
    var groups = Array.prototype.slice.call(form.querySelectorAll("[data-oy-opt]"));
    var picks = groups.map(function (g) {
      var r = g.querySelector("input:checked");
      return r ? r.value : null;
    });
    var fits = function (v, want) {
      if (!split) return v.title === want[0];
      var pv = parts(v);
      return want.every(function (val, k) {
        return pv[k] === val;
      });
    };
    var match = groups.length
      ? p.variants.filter(function (v) {
          return fits(v, picks);
        })[0]
      : p.variants[0];
    groups.forEach(function (g, i) {
      var label = g.querySelector("[data-oy-optval]");
      if (label) label.textContent = picks[i] || "";
      g.querySelectorAll("input").forEach(function (input) {
        var trial = picks.slice();
        trial[i] = input.value;
        var ok = p.variants.some(function (v) {
          return v.available && fits(v, trial);
        });
        input.parentNode.classList.toggle("is-out", !ok);
      });
    });
    var btn = form.querySelector("[data-oy-qadd]");
    var stock = form.querySelector("[data-oy-qstock]");
    if (!match) {
      btn.disabled = true;
      btn.textContent = "Unavailable";
      stock.className = "oy-quick__stock is-out";
      stock.textContent = "This combination isn't available";
      return;
    }
    form.querySelector("[data-oy-qvariant]").value = match.id;
    body.querySelector("[data-oy-qprice]").innerHTML = priceHtml(match);
    btn.disabled = !match.available;
    btn.textContent = match.available ? "Add to cart · " + money(match.price) : "Sold out";
    var q = match.inventoryQuantity;
    stock.className = "oy-quick__stock" + (q <= 0 ? " is-out" : q <= quick.lowStock ? " is-low" : "");
    stock.textContent = q <= 0 ? "Out of stock" : q <= quick.lowStock ? "Only " + q + " left" : "In stock";
    // Show the photo that names the chosen value ("… in Olive").
    var imgEl = body.querySelector("[data-oy-qimg]");
    if (imgEl) {
      for (var i = picks.length - 1; i >= 0; i -= 1) {
        var want = String(picks[i] || "").toLowerCase();
        var hit = want && p.images.filter(function (im) {
          return (" " + String(im.altText || "").toLowerCase() + " ").indexOf(" " + want + " ") !== -1;
        })[0];
        if (hit) {
          imgEl.src = hit.url;
          break;
        }
      }
    }
  }

  document.addEventListener(
    "click",
    function (e) {
      if (cfg.drawerOff) return;
      var el = e.target.closest && e.target.closest(QUICK);
      if (!el || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      var slug = quickSlug(el);
      if (!slug) return;
      e.preventDefault();
      var href = el.getAttribute("href") || cfg.root.replace(/\/$/, "") + "/products/" + slug;
      notice.classList.remove("is-shown", "is-error");
      title.textContent = "Quick add";
      foot.hidden = true;
      body.innerHTML = '<div class="oy-quick oy-quick--loading" aria-busy="true"><span class="oy-spinner" aria-label="Loading"></span></div>';
      open();
      request(quickUrl(slug))
        .then(function (data) {
          // Rented by the day: dates are picked on the product page.
          if (data.product && data.product.rental) {
            location.href = href;
            return;
          }
          renderQuick(data, href);
        })
        .catch(function () {
          location.href = href;
        });
    },
    true
  );

  // ── One-Click Checkout ─────────────────────────────────
  // With the One-Click Checkout app installed, "Checkout" opens a popup
  // that goes step by step: mobile number → a one-time code (when the
  // store can send one; it also signs the shopper in) → a saved or new
  // address → the ways to pay the store's gateways offer. A signed-in
  // shopper starts at the address step. The popup posts to the store's
  // normal checkout route (flagged oneClick); without JavaScript, or on any
  // error, the full checkout page still works.
  var ONE = cfg.oneClick;
  // Earlier versions kept the last order's details in this browser; the
  // popup now only ever fills in a signed-in shopper's own details.
  try {
    localStorage.removeItem("oy_1click_" + (cfg.root || "").replace(/[^a-z0-9]/gi, ""));
  } catch (e) {}
  var EXPRESS_URL = String(cfg.checkout || "").replace(/\/$/, "") + "/express";
  // The popup's details while a payment is in progress (this tab only) — a
  // payment that doesn't finish reopens the popup at the payment step.
  var RETRY_KEY = "oy_1click_retry";
  function pagePath() {
    var url = new URL(location.href);
    url.searchParams.delete("oyCheckout");
    url.searchParams.delete("oyError");
    return url.pathname + url.search;
  }
  // Signed out (the logout page adds ?signedOut=1): nothing of theirs stays.
  (function () {
    var q = new URLSearchParams(location.search);
    if (!q.has("signedOut")) return;
    try {
      sessionStorage.removeItem(RETRY_KEY);
    } catch (e) {}
    q.delete("signedOut");
    try {
      history.replaceState(history.state, "", location.pathname + (q.toString() ? "?" + q : ""));
    } catch (e) {}
  })();
  var ICON1 = {
    phone: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    card: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/></svg>',
    cash: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v4"/><rect x="3.5" y="8" width="17" height="11" rx="2.5"/><path d="M16 13.5h2"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    upi: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4l-4 16M14 4l4 8-4 8"/></svg>',
    bank: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-5 9 5M4.5 9v8M9.5 9v8M14.5 9v8M19.5 9v8M3 20h18"/></svg>',
    emi: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M12 14h4"/></svg>',
    later: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  };
  // Payment brand marks (paths from Simple Icons, CC0), inlined so checkout
  // loads nothing from elsewhere. UPI and RuPay are plain text marks.
  var PAY_LOGOS = {"GPay":{"d":"M3.963 7.235A3.963 3.963 0 00.422 9.419a3.963 3.963 0 000 3.559 3.963 3.963 0 003.541 2.184c1.07 0 1.97-.352 2.627-.957.748-.69 1.18-1.71 1.18-2.916a4.722 4.722 0 00-.07-.806H3.964v1.526h2.14a1.835 1.835 0 01-.79 1.205c-.356.241-.814.379-1.35.379-1.034 0-1.911-.697-2.225-1.636a2.375 2.375 0 010-1.517c.314-.94 1.191-1.636 2.225-1.636a2.152 2.152 0 011.52.594l1.132-1.13a3.808 3.808 0 00-2.652-1.033zm6.501.55v6.9h.886V11.89h1.465c.603 0 1.11-.196 1.522-.588a1.911 1.911 0 00.635-1.464 1.92 1.92 0 00-.635-1.456 2.125 2.125 0 00-1.522-.598zm2.427.85a1.156 1.156 0 01.823.365 1.176 1.176 0 010 1.686 1.171 1.171 0 01-.877.357H11.35V8.635h1.487a1.156 1.156 0 01.054 0zm4.124 1.175c-.842 0-1.477.308-1.907.925l.781.491c.288-.417.68-.626 1.175-.626a1.255 1.255 0 01.856.323 1.009 1.009 0 01.366.785v.202c-.34-.193-.774-.289-1.3-.289-.617 0-1.11.145-1.479.434-.37.288-.554.677-.554 1.165a1.476 1.476 0 00.525 1.156c.35.308.785.463 1.305.463.61 0 1.098-.27 1.465-.81h.038v.655h.848v-2.909c0-.61-.19-1.09-.568-1.44-.38-.35-.896-.525-1.551-.525zm2.263.154l1.946 4.422-1.098 2.38h.915L24 9.963h-.965l-1.368 3.391h-.02l-1.406-3.39zm-2.146 2.368c.494 0 .88.11 1.156.33 0 .372-.147.696-.44.973a1.413 1.413 0 01-.997.414 1.081 1.081 0 01-.69-.232.708.708 0 01-.293-.578c0-.257.12-.47.363-.647.24-.173.54-.26.9-.26Z","hex":"4285F4"},"PhonePe":{"d":"M10.206 9.941h2.949v4.692c-.402.201-.938.268-1.34.268-1.072 0-1.609-.536-1.609-1.743V9.941zm13.47 4.816c-1.523 6.449-7.985 10.442-14.433 8.919C2.794 22.154-1.199 15.691.324 9.243 1.847 2.794 8.309-1.199 14.757.324c6.449 1.523 10.442 7.985 8.919 14.433zm-6.231-5.888a.887.887 0 0 0-.871-.871h-1.609l-3.686-4.222c-.335-.402-.871-.536-1.407-.402l-1.274.401c-.201.067-.268.335-.134.469l4.021 3.82H6.386c-.201 0-.335.134-.335.335v.67c0 .469.402.871.871.871h.938v3.217c0 2.413 1.273 3.82 3.418 3.82.67 0 1.206-.067 1.877-.335v2.145c0 .603.469 1.072 1.072 1.072h.938a.432.432 0 0 0 .402-.402V9.874h1.542c.201 0 .335-.134.335-.335v-.67z","hex":"5F259F"},"Paytm":{"d":"M15.85 8.167a.204.204 0 0 0-.04.004c-.68.19-.543 1.148-1.781 1.23h-.12a.23.23 0 0 0-.052.005h-.001a.24.24 0 0 0-.184.235v1.09c0 .134.106.241.237.241h.645v4.623c0 .132.104.238.233.238h1.058a.236.236 0 0 0 .233-.238v-4.623h.6c.13 0 .236-.107.236-.241v-1.09a.239.239 0 0 0-.236-.24h-.612V8.386a.218.218 0 0 0-.216-.22zm4.225 1.17c-.398 0-.762.15-1.042.395v-.124a.238.238 0 0 0-.234-.224h-1.07a.24.24 0 0 0-.236.242v5.92a.24.24 0 0 0 .236.242h1.07c.12 0 .217-.091.233-.209v-4.25a.393.393 0 0 1 .371-.408h.196a.41.41 0 0 1 .226.09.405.405 0 0 1 .145.319v4.074l.004.155a.24.24 0 0 0 .237.241h1.07a.239.239 0 0 0 .235-.23l-.001-4.246c0-.14.062-.266.174-.34a.419.419 0 0 1 .196-.068h.198c.23.02.37.2.37.408.005 1.396.004 2.8.004 4.224a.24.24 0 0 0 .237.241h1.07c.13 0 .236-.108.236-.241v-4.543c0-.31-.034-.442-.08-.577a1.601 1.601 0 0 0-1.51-1.09h-.015a1.58 1.58 0 0 0-1.152.5c-.291-.308-.7-.5-1.153-.5zM.232 9.4A.234.234 0 0 0 0 9.636v5.924c0 .132.096.238.216.241h1.09c.13 0 .237-.107.237-.24l.004-1.658H2.57c.857 0 1.453-.605 1.453-1.481v-1.538c0-.877-.596-1.484-1.453-1.484H.232zm9.032 0a.239.239 0 0 0-.237.241v2.47c0 .94.657 1.608 1.579 1.608h.675s.016 0 .037.004a.253.253 0 0 1 .222.253c0 .13-.096.235-.219.251l-.018.004-.303.006H9.739a.239.239 0 0 0-.236.24v1.09a.24.24 0 0 0 .236.242h1.75c.92 0 1.577-.669 1.577-1.608v-4.56a.239.239 0 0 0-.236-.24h-1.07a.239.239 0 0 0-.236.24c-.005.787 0 1.525 0 2.255a.253.253 0 0 1-.25.25h-.449a.253.253 0 0 1-.25-.255c.005-.754-.005-1.5-.005-2.25a.239.239 0 0 0-.236-.24zm-4.004.006a.232.232 0 0 0-.238.226v1.023c0 .132.113.24.252.24h1.413c.112.017.2.1.213.23v.14c-.013.124-.1.214-.207.224h-.7c-.93 0-1.594.63-1.594 1.515v1.269c0 .88.57 1.506 1.495 1.506h1.94c.348 0 .63-.27.63-.6v-4.136c0-1.004-.508-1.637-1.72-1.637zm-3.713 1.572h.678c.139 0 .25.115.25.256v.836a.253.253 0 0 1-.25.256h-.1c-.192.002-.386 0-.578 0zm4.67 1.977h.445c.139 0 .252.108.252.24v.932a.23.23 0 0 1-.014.076.25.25 0 0 1-.238.164h-.445a.247.247 0 0 1-.252-.24v-.933c0-.132.113-.239.252-.239Z","hex":"20336B"},"VISA":{"d":"M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z","hex":"1A1F71"},"Mastercard":{"d":"M11.343 18.031c.058.049.12.098.181.146-1.177.783-2.59 1.238-4.107 1.238C3.32 19.416 0 16.096 0 12c0-4.095 3.32-7.416 7.416-7.416 1.518 0 2.931.456 4.105 1.238-.06.051-.12.098-.165.15C9.6 7.489 8.595 9.688 8.595 12c0 2.311 1.001 4.51 2.748 6.031zm5.241-13.447c-1.52 0-2.931.456-4.105 1.238.06.051.12.098.165.15C14.4 7.489 15.405 9.688 15.405 12c0 2.31-1.001 4.507-2.748 6.031-.058.049-.12.098-.181.146 1.177.783 2.588 1.238 4.107 1.238C20.68 19.416 24 16.096 24 12c0-4.094-3.32-7.416-7.416-7.416zM12 6.174c-.096.075-.189.15-.28.231C10.156 7.764 9.169 9.765 9.169 12c0 2.236.987 4.236 2.551 5.595.09.08.185.158.28.232.096-.074.189-.152.28-.232 1.563-1.359 2.551-3.359 2.551-5.595 0-2.235-.987-4.236-2.551-5.595-.09-.08-.184-.156-.28-.231z","hex":"EB001B"},"Amex":{"d":"M16.015 14.378c0-.32-.135-.496-.344-.622-.21-.12-.464-.135-.81-.135h-1.543v2.82h.675v-1.027h.72c.24 0 .39.024.478.125.12.13.104.38.104.55v.35h.66v-.555c-.002-.25-.017-.376-.108-.516-.06-.08-.18-.18-.33-.234l.02-.008c.18-.072.48-.297.48-.747zm-.87.407l-.028-.002c-.09.053-.195.058-.33.058h-.81v-.63h.824c.12 0 .24 0 .33.05.098.048.156.147.15.255 0 .12-.045.215-.134.27zM20.297 15.837H19v.6h1.304c.676 0 1.05-.278 1.05-.884 0-.28-.066-.448-.187-.582-.153-.133-.392-.193-.73-.207l-.376-.015c-.104 0-.18 0-.255-.03-.09-.03-.15-.105-.15-.21 0-.09.017-.166.09-.21.083-.046.177-.066.272-.06h1.23v-.602h-1.35c-.704 0-.958.437-.958.84 0 .9.776.855 1.407.87.104 0 .18.015.225.06.046.03.082.106.082.18 0 .077-.035.15-.08.18-.06.053-.15.07-.277.07zM0 0v10.096L.81 8.22h1.75l.225.464V8.22h2.043l.45 1.02.437-1.013h6.502c.295 0 .56.057.756.236v-.23h1.787v.23c.307-.17.686-.23 1.12-.23h2.606l.24.466v-.466h1.918l.254.465v-.466h1.858v3.948H20.87l-.36-.6v.585h-2.353l-.256-.63h-.583l-.27.614h-1.213c-.48 0-.84-.104-1.08-.24v.24h-2.89v-.884c0-.12-.03-.12-.105-.135h-.105v1.036H6.067v-.48l-.21.48H4.69l-.202-.48v.465H2.235l-.256-.624H1.4l-.256.624H0V24h23.786v-7.108c-.27.135-.613.18-.973.18H21.09v-.255c-.21.165-.57.255-.914.255H14.71v-.9c0-.12-.018-.12-.12-.12h-.075v1.022h-1.8v-1.066c-.298.136-.643.15-.928.136h-.214v.915h-2.18l-.54-.617-.57.6H4.742v-3.93h3.61l.518.602.554-.6h2.412c.28 0 .74.03.942.225v-.24h2.177c.202 0 .644.045.903.225v-.24h3.265v.24c.163-.164.508-.24.803-.24h1.89v.24c.194-.15.464-.24.84-.24h1.176V0H0zM21.156 14.955c.004.005.006.012.01.016.01.01.024.01.032.02l-.042-.035zM23.828 13.082h.065v.555h-.065zM23.865 15.03v-.005c-.03-.025-.046-.048-.075-.07-.15-.153-.39-.215-.764-.225l-.36-.012c-.12 0-.194-.007-.27-.03-.09-.03-.15-.105-.15-.21 0-.09.03-.16.09-.204.076-.045.15-.05.27-.05h1.223v-.588h-1.283c-.69 0-.96.437-.96.84 0 .9.78.855 1.41.87.104 0 .18.015.224.06.046.03.076.106.076.18 0 .07-.034.138-.09.18-.045.056-.136.07-.27.07h-1.288v.605h1.287c.42 0 .734-.118.9-.36h.03c.09-.134.135-.3.135-.523 0-.24-.045-.39-.135-.526zM18.597 14.208v-.583h-2.235V16.458h2.235v-.585h-1.57v-.57h1.533v-.584h-1.532v-.51M13.51 8.787h.685V11.6h-.684zM13.126 9.543l-.007.006c0-.314-.13-.5-.34-.624-.217-.125-.47-.135-.81-.135H10.43v2.82h.674v-1.034h.72c.24 0 .39.03.487.12.122.136.107.378.107.548v.354h.677v-.553c0-.25-.016-.375-.11-.516-.09-.107-.202-.19-.33-.237.172-.07.472-.3.472-.75zm-.855.396h-.015c-.09.054-.195.056-.33.056H11.1v-.623h.825c.12 0 .24.004.33.05.09.04.15.128.15.25s-.047.22-.134.266zM15.92 9.373h.632v-.6h-.644c-.464 0-.804.105-1.02.33-.286.3-.362.69-.362 1.11 0 .512.123.833.36 1.074.232.238.645.31.97.31h.78l.255-.627h1.39l.262.627h1.36v-2.11l1.272 2.11h.95l.002.002V8.786h-.684v1.963l-1.18-1.96h-1.02V11.4L18.11 8.744h-1.004l-.943 2.22h-.3c-.177 0-.362-.03-.468-.134-.125-.15-.186-.36-.186-.662 0-.285.08-.51.194-.63.133-.135.272-.165.516-.165zm1.668-.108l.464 1.118v.002h-.93l.466-1.12zM2.38 10.97l.254.628H4V9.393l.972 2.205h.584l.973-2.202.015 2.202h.69v-2.81H6.118l-.807 1.904-.876-1.905H3.343v2.663L2.205 8.787h-.997L.01 11.597h.72l.26-.626h1.39zm-.688-1.705l.46 1.118-.003.002h-.915l.457-1.12zM11.856 13.62H9.714l-.85.923-.825-.922H5.346v2.82H8l.855-.932.824.93h1.302v-.94h.838c.6 0 1.17-.164 1.17-.945l-.006-.003c0-.78-.598-.93-1.128-.93zM7.67 15.853l-.014-.002H6.02v-.557h1.47v-.574H6.02v-.51H7.7l.733.82-.764.824zm2.642.33l-1.03-1.147 1.03-1.108v2.253zm1.553-1.258h-.885v-.717h.885c.24 0 .42.098.42.344 0 .243-.15.372-.42.372zM9.967 9.373v-.586H7.73V11.6h2.237v-.58H8.4v-.564h1.527V9.88H8.4v-.507","hex":"2E77BC"},"Amazon Pay":{"d":"M14.3781 4.9945c-.3732-.3227-.953-.4843-1.7401-.4843-.3895 0-.779.0355-1.1684.1054-.3901.0706-.7172.1636-.9824.2797-.0993.0418-.166.0849-.1991.1304-.0331.0456-.05.1267-.05.2422v.3352c0 .1491.0537.224.1617.224a.337.337 0 0 0 .1061-.0187c.0374-.0125.0687-.0225.093-.0312.6385-.1904 1.247-.2859 1.8275-.2859.4968 0 .8451.0912 1.0442.274.1991.1823.2984.4969.2984.9444v.8201c-.5799-.141-1.1023-.211-1.5667-.211-.729 0-1.3088.1804-1.74.5406-.4308.3601-.6467.8432-.6467 1.448 0 .5642.1741 1.013.5224 1.3488.3477.3358.8201.503 1.4168.503.3564 0 .7147-.0705 1.0754-.2109.3608-.1404.6897-.3402.988-.5967l.0625.41c.025.1574.116.236.274.236h.5343c.1654 0 .249-.083.249-.2484V6.4987c-.0006-.6797-.1872-1.1809-.5599-1.5042zm-.6091 4.6c-.2734.2072-.5593.3645-.8576.4725-.2984.108-.5842.1617-.8576.1617-.3233 0-.5717-.085-.7459-.2547-.1741-.1698-.2609-.412-.2609-.7271 0-.721.4682-1.0817 1.4044-1.0817.2153 0 .4369.015.6647.0437.2278.0293.4456.0687.6529.118zM8.7726 6.402c-.1204-.402-.292-.744-.5161-1.0255-.2235-.2815-.4969-.4975-.8202-.6466-.3227-.1492-.6834-.2235-1.0816-.2235-.3727 0-.7378.07-1.0936.211-.3563.141-.6921.3483-1.0073.6216l-.0618-.3982c-.025-.1654-.1205-.2484-.2865-.2484h-.5468c-.1654 0-.2484.083-.2484.2484v8.3662c0 .166.083.2484.2484.2484h.7334c.166 0 .2484-.083.2484-.2484v-2.9086c.5387.4887 1.181.7334 1.9268.7334.4057 0 .7746-.0811 1.106-.2422.3314-.1616.6129-.3876.845-.6778.2323-.2896.4126-.6416.5406-1.0567.1286-.4144.1929-.8788.1929-1.3925.0012-.505-.0593-.9587-.1792-1.3606zM5.982 10.1369c-.5642 0-1.111-.1985-1.6409-.5967V6.0724c.5218-.3813 1.0773-.5717 1.666-.5717 1.1271 0 1.6907.7752 1.6907 2.3243-.0006 1.5417-.5723 2.3119-1.7158 2.3119zm13.0005 1.963l2.735-6.9612c.0575-.141.0868-.2403.0868-.2984 0-.0992-.058-.1491-.1741-.1491h-.696c-.1329 0-.2234.0212-.274.0624-.0499.0418-.0992.133-.1491.274l-1.6784 4.8228-1.7401-4.8228c-.05-.141-.0993-.2322-.1492-.274-.05-.0412-.141-.0624-.274-.0624h-.7459c-.116 0-.1741.0499-.1741.1491 0 .058.0287.1573.0868.2984l2.3992 5.917-.236.6341c-.141.3982-.2983.6716-.4724.8208-.1741.1491-.4188.2234-.7334.2234-.141 0-.2528-.0087-.3352-.025-.083-.0162-.1454-.025-.1866-.025-.1242 0-.1866.0787-.1866.236v.3233c0 .1161.0206.201.0624.2547.0412.0536.1074.0936.1991.118.2066.0574.4432.0873.7084.0873.4725 0 .8557-.1242 1.1497-.3732.2952-.2478.5543-.6585.7777-1.2302m2.7113 4.4233c-2.6276 1.9393-6.4369 2.9704-9.7174 2.9704-4.5975 0-8.7375-1.6996-11.8701-4.5283-.246-.2221-.0269-.5255.269-.3532 3.3798 1.9667 7.5597 3.1513 11.877 3.1513 2.9123 0 6.1136-.6042 9.0596-1.8537.4437-.1891.8163.2921.382.6135m1.0928-1.2483c.3364.4307-.3738 2.204-.691 2.996-.096.2396.11.3364.3271.1548 1.4094-1.179 1.7739-3.65 1.4855-4.0071-.2865-.3539-2.7506-.6585-4.2548.3976-.2316.1623-.1916.387.0649.3557.847-.101 2.7325-.3276 3.0683.103Z","hex":"FF9900"},"PayPal":{"d":"M15.607 4.653H8.941L6.645 19.251H1.82L4.862 0h7.995c3.754 0 6.375 2.294 6.473 5.513-.648-.478-2.105-.86-3.722-.86m6.57 5.546c0 3.41-3.01 6.853-6.958 6.853h-2.493L11.595 24H6.74l1.845-11.538h3.592c4.208 0 7.346-3.634 7.153-6.949a5.24 5.24 0 0 1 2.848 4.686M9.653 5.546h6.408c.907 0 1.942.222 2.363.541-.195 2.741-2.655 5.483-6.441 5.483H8.714Z","hex":"003087"}};
  function payMark(name) {
    var l = PAY_LOGOS[name];
    if (l) return '<i class="oy-1c__brand-chip" title="' + esc(name) + '"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="#' + l.hex + '" d="' + l.d + '"/></svg>' + esc(name) + "</i>";
    if (name === "UPI") return '<i class="oy-1c__brand-chip"><b class="oy-mark oy-mark--upi">UPI</b></i>';
    if (name === "RuPay") return '<i class="oy-1c__brand-chip"><b class="oy-mark oy-mark--rupay">RuPay</b></i>';
    return "<i>" + esc(name) + "</i>";
  }
  var MODE_ICON = { upi: "upi", card: "card", netbanking: "bank", wallet: "wallet", emi: "emi", paylater: "later", paypal: "card", cod: "cash" };
  var MODE_SHORT = { upi: "UPI", card: "card", netbanking: "net banking", wallet: "wallet", emi: "EMI", paylater: "Pay later", paypal: "PayPal" };
  var STEPS = ["mobile", "address", "payment"];
  var sheet = null;
  var st = null; // popup state

  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove("is-open");
    document.documentElement.classList.remove("oy-1c-open");
    var s = sheet;
    sheet = null;
    clearInterval(st && st.timer);
    setTimeout(function () {
      s.remove();
    }, 220);
  }

  function digits(v) {
    return String(v || "").replace(/\D/g, "");
  }
  function tenDigits(v) {
    var d = digits(v);
    if (d.length === 12 && d.indexOf("91") === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === "0") d = d.slice(1);
    return d;
  }
  function prettyPhone(d) {
    return "+91 " + d.slice(0, 5) + " " + d.slice(5);
  }
  function addressLines(a) {
    return [a.address1, a.address2, [a.city, a.province].filter(Boolean).join(", ") + (a.zip ? " " + a.zip : "")].filter(Boolean);
  }
  // India Post PIN ranges → state, to fill the state in from the PIN code
  // (the shopper can still change it).
  var PIN_STATES = [
    [110, 110, "Delhi"], [120, 136, "Haryana"], [140, 159, "Punjab"], [160, 160, "Chandigarh"], [161, 169, "Punjab"],
    [170, 177, "Himachal Pradesh"], [180, 193, "Jammu and Kashmir"], [194, 194, "Ladakh"],
    [246, 246, "Uttarakhand"], [248, 249, "Uttarakhand"], [262, 263, "Uttarakhand"], [200, 285, "Uttar Pradesh"],
    [301, 345, "Rajasthan"], [396, 396, "Dadra and Nagar Haveli and Daman and Diu"], [360, 395, "Gujarat"],
    [403, 403, "Goa"], [400, 445, "Maharashtra"], [450, 488, "Madhya Pradesh"], [490, 497, "Chhattisgarh"],
    [500, 509, "Telangana"], [510, 535, "Andhra Pradesh"], [560, 591, "Karnataka"], [605, 605, "Puducherry"],
    [600, 643, "Tamil Nadu"], [682, 682, "Lakshadweep"], [670, 695, "Kerala"], [737, 737, "Sikkim"],
    [744, 744, "Andaman and Nicobar Islands"], [700, 743, "West Bengal"], [751, 770, "Odisha"], [781, 788, "Assam"],
    [790, 792, "Arunachal Pradesh"], [793, 794, "Meghalaya"], [795, 795, "Manipur"], [796, 796, "Mizoram"],
    [797, 798, "Nagaland"], [799, 799, "Tripura"], [814, 835, "Jharkhand"], [800, 855, "Bihar"],
  ];
  function stateForPin(pin) {
    var n = Number(String(pin).slice(0, 3));
    for (var i = 0; i < PIN_STATES.length; i += 1) {
      if (n >= PIN_STATES[i][0] && n <= PIN_STATES[i][1]) return PIN_STATES[i][2];
    }
    return null;
  }
  function fromDetails(v) {
    if (!v || !v.shippingAddress1) return null;
    return { name: v.shippingName, address1: v.shippingAddress1, address2: v.shippingAddress2, city: v.shippingCity, province: v.shippingProvince, zip: v.shippingZip, company: v.company };
  }

  function postExpress(body) {
    return fetch(EXPRESS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
          return data;
        });
    });
  }

  // ── Pieces ──
  function summaryHtml() {
    var c = lastCart || {};
    var items = c.items || [];
    var rows = "";
    items.forEach(function (it) {
      rows +=
        '<li class="oy-1c__item"><span class="oy-1c__thumb">' +
        (it.image ? '<img src="' + esc(it.image) + '" alt="" width="48" height="60" loading="lazy">' : ICON.photo) +
        '<b>' + it.quantity + "</b></span>" +
        '<span class="oy-1c__iname">' + esc(it.title) + "</span><span>" + money(it.lineTotal) + "</span></li>";
    });
    var line = function (label, value, cls) {
      return '<div class="oy-1c__row' + (cls ? " " + cls : "") + '"><span>' + label + "</span><span>" + value + "</span></div>";
    };
    var ship = c.shipping ? (Number(c.shipping.amount) > 0 ? money(c.shipping.amount) : "Free") : "Free";
    return (
      '<ul class="oy-1c__items">' + rows + "</ul>" +
      line("Subtotal", money(c.subtotal)) +
      (c.discount && Number(c.discount.amount) > 0 ? line("Discount (" + esc(c.discount.code) + ")", "−" + money(c.discount.amount), "is-save") : "") +
      line("Delivery", ship, ship === "Free" ? "is-save" : "") +
      (c.tax && Number(c.tax.amount) > 0 ? line("Tax", money(c.tax.amount)) : "") +
      (c.gift_card && Number(c.gift_card.amount) > 0 ? line("Gift card", "−" + money(c.gift_card.amount), "is-save") : "") +
      line("To pay", money(c.due != null ? c.due : c.total), "is-total")
    );
  }

  function stepperHtml() {
    var at = STEPS.indexOf(st.step === "otp" ? "mobile" : st.step);
    var labels = ["Mobile", "Address", "Payment"];
    return (
      '<ol class="oy-1c__steps">' +
      labels
        .map(function (l, i) {
          return '<li class="' + (i < at ? "is-done" : i === at ? "is-now" : "") + '"' + (i === at ? ' aria-current="step"' : "") + "><span>" + (i < at ? ICON.check : i + 1) + "</span>" + l + "</li>";
        })
        .join("") +
      "</ol>"
    );
  }

  function field(name, label, attrs, value, full) {
    return (
      '<label class="oy-1c__field' + (full ? " oy-1c__field--full" : "") + '"><span>' + label + "</span>" +
      '<input class="oy-1c__input" name="' + name + '" value="' + esc(value || "") + '" ' + attrs + "></label>"
    );
  }

  function contactChip() {
    return (
      '<div class="oy-1c__chip">' + ICON1.phone + "<span><strong>" + esc(prettyPhone(st.phone)) + "</strong>" +
      (st.verified ? '<em class="oy-1c__ok">' + ICON.check + " Verified</em>" : "") +
      '</span><button type="button" class="oy-1c__link" data-oy-go="mobile">Change</button></div>'
    );
  }

  // ── Steps ──
  function viewMobile() {
    return {
      title: "Enter your mobile number",
      sub: ONE.otp ? "We'll send a one-time code to find your saved addresses." : "For delivery updates about your order.",
      body:
        '<label class="oy-1c__phone"><span class="oy-1c__cc">🇮🇳 +91</span>' +
        '<input class="oy-1c__input" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="14" placeholder="98765 43210" value="' + esc(st.typed != null ? st.typed : st.phone) + '" aria-label="Mobile number" data-oy-phone></label>' +
        '<p class="oy-1c__fine">By continuing you agree to receive order updates on this number.</p>',
      cta: "Continue",
    };
  }

  function viewOtp() {
    var boxes = "";
    for (var i = 0; i < 6; i += 1) {
      // No maxlength: SMS autofill and paste put the whole code in one box,
      // and the input handler spreads it across the six.
      boxes += '<input class="oy-1c__digit" type="text" inputmode="numeric" ' + (i === 0 ? 'autocomplete="one-time-code" ' : 'autocomplete="off" ') + 'aria-label="Digit ' + (i + 1) + '" data-oy-digit="' + i + '">';
    }
    return {
      title: "Verify your number",
      sub: "Enter the 6-digit code sent to <strong>" + esc(prettyPhone(st.phone)) + '</strong> <button type="button" class="oy-1c__link" data-oy-go="mobile">Edit</button>',
      body:
        '<div class="oy-1c__otp" role="group" aria-label="One-time code">' + boxes + "</div>" +
        '<p class="oy-1c__resend" data-oy-resend></p>',
      cta: "Verify",
    };
  }

  function viewAddress() {
    var f = ONE.fields || {};
    var html = contactChip();
    if (st.addresses.length && st.pick !== "new") {
      html += '<div class="oy-1c__label">Deliver to</div><div class="oy-1c__addrs" role="radiogroup" aria-label="Saved addresses">';
      st.addresses.forEach(function (a, i) {
        html +=
          '<label class="oy-1c__addr"><input type="radio" name="oyAddr" value="' + i + '"' + (st.pick === i ? " checked" : "") + ">" +
          '<span class="oy-1c__addr-body"><strong>' + esc(a.name || "") + "</strong>" +
          addressLines(a).map(function (l) { return "<span>" + esc(l) + "</span>"; }).join("") +
          (a.network ? '<em class="oy-1c__net">Saved from your orders on other Oyklane stores</em>' : "") +
          "</span></label>";
      });
      html += '<button type="button" class="oy-1c__add" data-oy-newaddr>' + ICON1.plus + " Add a new address</button></div>";
      if (!st.email) html += '<div class="oy-1c__grid oy-1c__grid--email">' + field("email", "Email for order updates", 'type="email" required autocomplete="email" placeholder="you@example.com"', st.email, true) + "</div>";
    } else {
      var d = st.draft || {};
      html +=
        '<div class="oy-1c__label">Delivery address' + (st.addresses.length ? ' <button type="button" class="oy-1c__link" data-oy-saved>Use a saved address</button>' : "") + "</div>" +
        '<div class="oy-1c__grid">' +
        field("shippingName", "Full name", 'required autocomplete="name"', d.name || st.name, true) +
        field("email", "Email", 'type="email" required autocomplete="email" placeholder="you@example.com"', st.email, true) +
        field("shippingZip", "PIN code", 'required inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{6}" maxlength="6"', d.zip) +
        field("shippingCity", "City", 'required autocomplete="address-level2"', d.city) +
        field("shippingAddress1", "House no., building, street, area", 'required autocomplete="address-line1"', d.address1, true) +
        (f.address2 === "hidden" ? "" : field("shippingAddress2", "Landmark" + (f.address2 === "required" ? "" : " (optional)"), 'autocomplete="address-line2"' + (f.address2 === "required" ? " required" : ""), d.address2, true)) +
        field("shippingProvince", "State", 'required autocomplete="address-level1" list="oy-1c-states"', d.province, true) +
        (f.company === "required" ? field("company", "Company", 'required autocomplete="organization" maxlength="120"', d.company, true) : "") +
        '<datalist id="oy-1c-states">' + (ONE.states || []).map(function (s) { return '<option value="' + esc(s) + '">'; }).join("") + "</datalist>" +
        "</div>" +
        (f.country === "show" ? '<p class="oy-1c__fine">Shipping outside India? <a href="' + esc(cfg.checkout) + '">Use the full checkout</a>.</p>' : "");
    }
    return { title: "Where should we deliver?", sub: "", body: html, cta: "Continue to payment" };
  }

  function chosen() {
    return (ONE.options || [])[st.option] || (ONE.options || [])[0] || null;
  }

  function payLabel() {
    var due = lastCart ? (lastCart.due != null ? lastCart.due : lastCart.total) : 0;
    var o = chosen();
    if (!o || o.mode === "cod") return "Place order · " + money(due);
    return ICON.lock + " Pay " + money(due) + (MODE_SHORT[o.mode] ? " with " + MODE_SHORT[o.mode] : "");
  }

  function viewPayment() {
    var a = st.address;
    var options = ONE.options || [];
    var html =
      '<div class="oy-1c__chip oy-1c__chip--addr">' + ICON1.pin + "<span><strong>" + esc(a.name) + "</strong><small>" + esc(addressLines(a).join(", ")) + "</small><small>" + esc(prettyPhone(st.phone)) + " · " + esc(st.email) + "</small></span>" +
      '<button type="button" class="oy-1c__link" data-oy-go="address">Change</button></div>' +
      '<div class="oy-1c__label">Pay with</div><div class="oy-1c__pay" role="radiogroup" aria-label="Ways to pay">';
    options.forEach(function (o, i) {
      html +=
        '<label class="oy-1c__opt' + (i === 0 && o.mode === "upi" ? " is-top" : "") + '"><input type="radio" name="payOption" value="' + i + '"' + (st.option === i ? " checked" : "") + ">" +
        '<span class="oy-1c__opt-icon">' + (o.mode === "upi" ? '<b class="oy-mark oy-mark--upi">UPI</b>' : ICON1[MODE_ICON[o.mode] || "card"]) + "</span>" +
        '<span class="oy-1c__opt-text"><strong>' + esc(o.title) + (i === 0 && o.mode === "upi" ? ' <em class="oy-1c__pick">Fastest</em>' : "") + "</strong>" +
        (o.subtitle ? "<small>" + esc(o.subtitle) + "</small>" : "") +
        ((o.badges && o.badges.length) || o.testMode
          ? '<span class="oy-1c__badges">' + (o.badges || []).map(payMark).join("") + (o.testMode ? '<i class="oy-1c__test">Test mode</i>' : "") + "</span>"
          : "") +
        "</span></label>";
    });
    if (!options.length) html += '<p class="oy-1c__fine">This store isn\'t taking payments right now.</p>';
    html += "</div>";
    var o = chosen();
    if (o && o.gateway) html += '<p class="oy-1c__fine">You\'ll finish paying securely with ' + esc(o.gateway) + ".</p>";
    return { title: "Choose how to pay", sub: "", body: html, cta: "pay" };
  }

  // ── Render ──
  function draw1c(focusSel) {
    var view = { mobile: viewMobile, otp: viewOtp, address: viewAddress, payment: viewPayment }[st.step]();
    var due = lastCart ? (lastCart.due != null ? lastCart.due : lastCart.total) : 0;
    var cta = view.cta === "pay" ? payLabel() : view.cta;
    var count = lastCart ? lastCart.item_count || 0 : 0;
    sheet.querySelector(".oy-1c__panel").innerHTML =
      '<header class="oy-1c__head">' +
      (st.step !== "mobile" ? '<button type="button" class="oy-1c__icon" data-oy-back aria-label="Back">' + ICON1.back + "</button>" : '<span class="oy-1c__brand">' + esc(ONE.storeName || "") + "</span>") +
      '<span class="oy-1c__secure">' + ICON1.shield + " Secure checkout</span>" +
      '<button type="button" class="oy-1c__icon" data-oy-1c-close aria-label="Close">' + ICON.x + "</button></header>" +
      '<button type="button" class="oy-1c__sumbar" aria-expanded="' + (st.open ? "true" : "false") + '" data-oy-sum>' +
      "<span>Order summary · " + count + " item" + (count === 1 ? "" : "s") + ' <i class="oy-1c__caret">' + ICON1.chevron + "</i></span><strong>" + money(due) + "</strong></button>" +
      '<div class="oy-1c__body">' +
      '<div class="oy-1c__sum"' + (st.open ? "" : " hidden") + ">" + summaryHtml() + "</div>" +
      stepperHtml() +
      '<h2 id="oy-1c-title" class="oy-1c__title">' + view.title + "</h2>" +
      (view.sub ? '<p class="oy-1c__sub">' + view.sub + "</p>" : "") +
      '<p class="oy-1c__error" role="alert"' + (st.error ? "" : " hidden") + ">" + esc(st.error || "") + "</p>" +
      view.body +
      "</div>" +
      '<footer class="oy-1c__foot"><button type="submit" class="oy-btn oy-btn--block oy-1c__cta"' + (st.busy ? " disabled" : "") + ">" + (st.busy ? '<span class="oy-spinner oy-spinner--sm" aria-hidden="true"></span> ' + st.busy : cta) + "</button>" +
      '<p class="oy-1c__trust">' + ICON1.shield + " Payments are encrypted and secure</p></footer>";
    if (st.step === "otp") startResend();
    var el = focusSel && sheet.querySelector(focusSel);
    if (el) el.focus();
  }

  function goStep(step, focus) {
    st.step = step;
    st.error = null;
    st.busy = null;
    draw1c(focus || { mobile: "[data-oy-phone]", otp: "[data-oy-digit='0']", address: ".oy-1c__input, input[name=oyAddr]:checked", payment: "input[name=payOption]:checked" }[step]);
  }
  function fail1c(msg, focus) {
    st.error = msg;
    st.busy = null;
    draw1c(focus);
  }

  function startResend() {
    clearInterval(st.timer);
    var el = sheet.querySelector("[data-oy-resend]");
    var tick = function () {
      var left = Math.max(0, Math.ceil((st.resendAt - Date.now()) / 1000));
      if (!el.isConnected) return clearInterval(st.timer);
      el.innerHTML = left > 0 ? "Resend code in 0:" + (left < 10 ? "0" : "") + left : "Didn't get it? <button type=\"button\" class=\"oy-1c__link\" data-oy-resend-now>Resend code</button>";
      if (!left) clearInterval(st.timer);
    };
    tick();
    st.timer = setInterval(tick, 1000);
  }

  // ── Actions ──
  function sendCode() {
    st.busy = "Sending code…";
    draw1c();
    postExpress({ action: "code", phone: "+91" + st.phone })
      .then(function (res) {
        if (res.otp) {
          st.resendAt = Date.now() + 30000;
          goStep("otp");
        } else {
          goStep("address");
        }
      })
      .catch(function (err) {
        fail1c(err.message, "[data-oy-phone]");
      });
  }

  function verifyCode(code) {
    st.busy = "Verifying…";
    draw1c();
    postExpress({ action: "verify", phone: "+91" + st.phone, code: code })
      .then(function (res) {
        st.verified = true;
        // A number with an account signs the shopper in (session cookie).
        if (res.signedIn) st.signedIn = true;
        st.name = st.name || res.name || "";
        st.email = st.email || res.email || "";
        (res.addresses || []).forEach(function (a) {
          var dup = st.addresses.some(function (b) {
            return digits(b.zip) === digits(a.zip) && String(b.address1).toLowerCase() === String(a.address1).toLowerCase();
          });
          if (!dup) st.addresses.push(a);
        });
        st.pick = st.addresses.length ? 0 : "new";
        goStep("address");
      })
      .catch(function (err) {
        fail1c(err.message, "[data-oy-digit='0']");
      });
  }

  function readAddress(form) {
    if (st.pick !== "new" && st.addresses.length) {
      var emailEl = form.elements.email;
      if (emailEl) {
        st.email = emailEl.value.trim();
        if (!emailEl.checkValidity() || !st.email) return fail1c("Enter a valid email for order updates.", "input[name=email]");
      }
      st.address = st.addresses[st.pick];
      return true;
    }
    var bad = Array.prototype.filter.call(form.querySelectorAll(".oy-1c__input"), function (el) {
      return !el.checkValidity() || (el.required && !el.value.trim());
    })[0];
    var val = function (n) {
      return form.elements[n] ? form.elements[n].value.trim() : "";
    };
    st.draft = { name: val("shippingName"), address1: val("shippingAddress1"), address2: val("shippingAddress2"), city: val("shippingCity"), province: val("shippingProvince"), zip: val("shippingZip"), company: val("company") };
    st.email = val("email");
    if (bad) {
      var label = bad.closest("label") ? bad.closest("label").querySelector("span").textContent : "This field";
      return fail1c(label + ": " + (bad.validationMessage || "please fill this in."), 'input[name="' + bad.name + '"]');
    }
    st.address = st.draft;
    return true;
  }

  function placeOrder() {
    var a = st.address;
    var o = chosen();
    if (!o) return;
    var method = o.value;
    var data = {
      email: st.email,
      phone: "+91" + st.phone,
      shippingName: a.name,
      shippingAddress1: a.address1,
      shippingAddress2: a.address2 || "",
      company: a.company || "",
      shippingCity: a.city,
      shippingProvince: a.province,
      shippingZip: a.zip,
      shippingCountry: "IN",
      paymentMethod: method,
      payMode: o.mode,
      oneClick: "1",
      // Where to come back to if the payment doesn't finish.
      returnTo: pagePath(),
    };
    try {
      sessionStorage.setItem(RETRY_KEY, JSON.stringify({ phone: st.phone, email: st.email, verified: st.verified, address: a, addresses: st.addresses, mode: o.mode }));
    } catch (x) {}
    var form = document.createElement("form");
    form.method = "post";
    form.action = cfg.checkout;
    form.hidden = true;
    Object.keys(data).forEach(function (k) {
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = data[k];
      form.appendChild(input);
    });
    document.body.appendChild(form);
    st.busy = method === "cod" ? "Placing your order…" : "Taking you to payment…";
    draw1c();
    try {
      window.dispatchEvent(new CustomEvent("oy:checkout", { detail: { oneClick: true, total: lastCart && lastCart.total } }));
    } catch (x) {}
    form.submit();
  }

  function advance(form) {
    if (st.busy) return;
    if (st.step === "mobile") {
      st.typed = form.elements.phone.value;
      var d = tenDigits(st.typed);
      if (!/^[6-9]\d{9}$/.test(d)) return fail1c("Enter a valid 10-digit mobile number.", "[data-oy-phone]");
      if (st.phone !== d) {
        // A different number: forget what the last one unlocked.
        st.verified = false;
        st.addresses = st.saved.slice();
      }
      st.phone = d;
      st.typed = null;
      if (ONE.otp && !st.verified) return sendCode();
      st.pick = st.addresses.length ? 0 : "new";
      return goStep("address");
    }
    if (st.step === "otp") {
      var code = Array.prototype.map.call(form.querySelectorAll("[data-oy-digit]"), function (el) {
        return el.value;
      }).join("");
      if (code.length !== 6) return fail1c("Enter all 6 digits of the code.", "[data-oy-digit='0']");
      return verifyCode(code);
    }
    if (st.step === "address") {
      if (readAddress(form) === true) goStep("payment");
      return;
    }
    if (st.step === "payment") placeOrder();
  }

  function openSheet(retry) {
    if (!ONE || ONE.provider !== "native") {
      location.href = cfg.checkout;
      return;
    }
    // A signed-in shopper starts at the address step with their details;
    // anyone else starts with their mobile number.
    var me = ONE.prefill || null;
    var saved = [];
    var own = fromDetails(me);
    if (own) saved.push(own);
    var phone = me ? tenDigits(me.phone) : "";
    st = {
      step: phone.length === 10 ? "address" : "mobile",
      phone: phone.length === 10 ? phone : "",
      verified: Boolean(me && me.phoneVerified),
      signedIn: Boolean(me),
      email: (me && me.email) || "",
      name: (me && me.shippingName) || "",
      saved: saved,
      addresses: saved.slice(),
      pick: saved.length ? 0 : "new",
      option: 0,
      open: false,
      error: null,
      busy: null,
    };
    // Back after a payment that didn't finish: straight to the payment
    // step, saying why.
    if (retry) st.error = retry.error || null;
    if (retry && retry.saved && retry.saved.address && retry.saved.phone) {
      var r = retry.saved;
      st.step = "payment";
      st.phone = r.phone;
      st.email = r.email || st.email;
      st.verified = Boolean(r.verified);
      st.address = r.address;
      st.addresses = r.addresses && r.addresses.length ? r.addresses : [r.address];
      st.pick = 0;
      st.addresses.forEach(function (x, i) {
        if (x.address1 === r.address.address1 && x.zip === r.address.zip) st.pick = i;
      });
      (ONE.options || []).forEach(function (x, i) {
        if (x.mode === r.mode) st.option = i;
      });
    }
    sheet = document.createElement("div");
    sheet.className = "oy-1c";
    sheet.innerHTML = '<div class="oy-1c__scrim" data-oy-1c-close></div><form class="oy-1c__panel" role="dialog" aria-modal="true" aria-labelledby="oy-1c-title" novalidate></form>';
    document.body.appendChild(sheet);
    document.documentElement.classList.add("oy-1c-open");
    var form = sheet.querySelector("form");

    sheet.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("[data-oy-1c-close]")) return closeSheet();
      if (t.closest("[data-oy-sum]")) {
        st.open = !st.open;
        var sum = sheet.querySelector(".oy-1c__sum");
        sum.hidden = !st.open;
        t.closest("[data-oy-sum]").setAttribute("aria-expanded", st.open ? "true" : "false");
        return;
      }
      if (t.closest("[data-oy-back]")) return goStep(st.step === "payment" ? "address" : "mobile");
      var to = t.closest("[data-oy-go]");
      if (to) return goStep(to.getAttribute("data-oy-go"));
      if (t.closest("[data-oy-newaddr]")) {
        st.pick = "new";
        return goStep("address", "input[name=shippingName]");
      }
      if (t.closest("[data-oy-saved]")) {
        st.pick = 0;
        return goStep("address");
      }
      if (t.closest("[data-oy-resend-now]")) return sendCode();
    });
    form.addEventListener("change", function (e) {
      var t = e.target;
      if (t.name === "oyAddr") st.pick = Number(t.value);
      if (t.name === "payOption") {
        st.option = Number(t.value);
        draw1c("input[name=payOption]:checked");
      }
    });
    // OTP boxes: one digit each, auto-advance, paste fills them all, and
    // the last digit submits.
    form.addEventListener("input", function (e) {
      var t = e.target;
      if (t.hasAttribute("data-oy-phone")) {
        t.value = t.value.replace(/[^\d ]/g, "");
        return;
      }
      // A 6-digit PIN code fills in the state (when it's still empty).
      if (t.name === "shippingZip") {
        t.value = digits(t.value).slice(0, 6);
        var stateEl = form.elements.shippingProvince;
        var guess = t.value.length === 6 && stateForPin(t.value);
        if (guess && stateEl && !stateEl.value) stateEl.value = guess;
        return;
      }
      if (!t.hasAttribute("data-oy-digit")) return;
      var boxes = form.querySelectorAll("[data-oy-digit]");
      var i = Number(t.getAttribute("data-oy-digit"));
      var d = digits(t.value);
      if (d.length > 1) {
        d.split("").slice(0, 6 - i).forEach(function (ch, k) {
          boxes[i + k].value = ch;
        });
      } else {
        t.value = d;
      }
      var filled = Array.prototype.map.call(boxes, function (b) { return b.value; }).join("");
      if (filled.length === 6) return advance(form);
      if (d && i < 5) boxes[Math.min(5, i + Math.max(1, d.length))].focus();
    });
    form.addEventListener("keydown", function (e) {
      var t = e.target;
      if (t.hasAttribute && t.hasAttribute("data-oy-digit") && e.key === "Backspace" && !t.value) {
        var prev = form.querySelector("[data-oy-digit='" + (Number(t.getAttribute("data-oy-digit")) - 1) + "']");
        if (prev) {
          prev.value = "";
          prev.focus();
          e.preventDefault();
        }
      }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      advance(form);
    });

    draw1c();
    requestAnimationFrame(function () {
      sheet.classList.add("is-open");
      var why = st.error;
      goStep(st.step);
      if (why) fail1c(why);
    });
    // Signed in: the addresses saved on the account and used with its number.
    if (st.signedIn && !retry) {
      postExpress({ action: "mine" })
        .then(function (res) {
          if (!sheet || !st) return;
          st.email = st.email || res.email || "";
          st.name = st.name || res.name || "";
          (res.addresses || []).forEach(function (a) {
            var dup = st.addresses.some(function (b) {
              return digits(b.zip) === digits(a.zip) && String(b.address1).toLowerCase() === String(a.address1).toLowerCase();
            });
            if (!dup) st.addresses.push(a);
          });
          st.saved = st.addresses.slice();
          if (st.addresses.length && st.pick === "new" && !st.draft) st.pick = 0;
          if (st.step === "address" && !st.busy) draw1c();
        })
        .catch(function () {});
    }
  }
  if (ONE) {
    // Sent back after a payment that didn't finish (the gateway's cancel,
    // Razorpay's window closed, an error placing the order): reopen the
    // popup where they left off.
    var retryParams = new URLSearchParams(location.search);
    if (retryParams.get("oyCheckout") === "retry") {
      var retryWhy = retryParams.get("oyError") || "Payment wasn't completed. Try again, or choose another way to pay.";
      try {
        history.replaceState(history.state, "", pagePath());
      } catch (x) {}
      var retrySaved = null;
      try {
        retrySaved = JSON.parse(sessionStorage.getItem(RETRY_KEY) || "null");
      } catch (x) {}
      request(cfg.cartJson)
        .then(function (res) {
          render(res.cart);
          if (res.cart && res.cart.items && res.cart.items.length) openSheet({ saved: retrySaved, error: retryWhy });
        })
        .catch(function () {});
    }
    // The browser's Back button from the payment page brings this page
    // back as it was, mid-"Taking you to payment…": paid → close; not
    // paid → back to the payment step.
    window.addEventListener("pageshow", function (e) {
      if (!e.persisted || !sheet || !st || !st.busy) return;
      request(cfg.cartJson)
        .then(function (res) {
          render(res.cart);
          if (!res.cart || !res.cart.items || !res.cart.items.length) return closeSheet();
          st.step = "payment";
          fail1c("Payment wasn't completed. Try again, or choose another way to pay.");
        })
        .catch(function () {
          st.busy = null;
          draw1c();
        });
    });

    foot.addEventListener("click", function (e) {
      if (!e.target.closest("[data-oy-oneclick]")) return;
      e.preventDefault();
      openSheet();
    });
    // Any "Checkout" link on the page (the cart page's button, a theme's
    // own) opens the popup too, instead of the full checkout page.
    var CHECKOUT_PATH = pathOf(cfg.checkout);
    document.addEventListener(
      "click",
      function (e) {
        var link = e.target.closest && e.target.closest("a[href]");
        if (!link || sheet || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (pathOf(link.href) !== CHECKOUT_PATH || link.closest(".oy-1c")) return;
        e.preventDefault();
        request(cfg.cartJson)
          .then(function (res) {
            render(res.cart);
            if (res.cart && res.cart.items && res.cart.items.length) openSheet();
            else location.href = link.href;
          })
          .catch(function () {
            location.href = link.href;
          });
      },
      true
    );
    document.addEventListener("keydown", function (e) {
      if (!sheet) return;
      if (e.key === "Escape") return closeSheet();
      if (e.key !== "Tab") return;
      // Keep focus inside the popup while it's open.
      var focusable = sheet.querySelectorAll('a[href],button:not([disabled]),input:not([type=hidden]):not([disabled])');
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  // Quantity buttons inside the drawer.
  body.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-oy-qty]");
    if (!btn || busy) return;
    busy = true;
    body.setAttribute("aria-busy", "true");
    var data = new FormData();
    data.append("variantId", btn.getAttribute("data-variant"));
    if (btn.getAttribute("data-key")) data.append("lineKey", btn.getAttribute("data-key"));
    data.append("quantity", btn.getAttribute("data-oy-qty"));
    request(cfg.update, data)
      .then(function (res) {
        render(res.cart);
      })
      .catch(function () {
        location.href = cfg.cart;
      })
      .then(function () {
        busy = false;
        body.removeAttribute("aria-busy");
      });
  });

})();
