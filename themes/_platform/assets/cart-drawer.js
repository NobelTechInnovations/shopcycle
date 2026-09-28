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
        '<span class="oy-line__price">' + money(item.price) + "</span>" +
        '<div class="oy-line__row">' +
        '<div class="oy-qty" role="group" aria-label="Quantity of ' + esc(item.title) + '">' +
        '<button type="button" data-oy-qty="' + (item.quantity - 1) + '" data-variant="' + esc(item.variantId) + '" aria-label="Decrease quantity">' + ICON.minus + "</button>" +
        '<span aria-live="polite">' + item.quantity + "</span>" +
        '<button type="button" data-oy-qty="' + (item.quantity + 1) + '" data-variant="' + esc(item.variantId) + '" aria-label="Increase quantity">' + ICON.plus + "</button>" +
        "</div>" +
        '<button type="button" class="oy-line__remove" data-oy-qty="0" data-variant="' + esc(item.variantId) + '">Remove</button>' +
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
      var form = e.target;
      if (!(form instanceof HTMLFormElement) || pathOf(form.action) !== ADD_PATH) return;
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
  // store can send one) → a saved or new address → payment. A returning
  // buyer confirms the code, picks an address and pays. The popup posts to
  // the store's normal checkout route (flagged oneClick); without
  // JavaScript, or on any error, the full checkout page still works.
  var ONE = cfg.oneClick;
  var REMEMBER_KEY = "oy_1click_" + (cfg.root || "").replace(/[^a-z0-9]/gi, "");
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
  function remembered() {
    try {
      return JSON.parse(localStorage.getItem(REMEMBER_KEY) || "null");
    } catch (e) {
      return null;
    }
  }
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
  };
  var METHOD_TEXT = {
    cod: ["Cash on delivery", "Pay by cash or UPI when your order arrives", "cash"],
    razorpay: ["UPI, cards & net banking", "Google Pay, PhonePe, Paytm, all cards · Razorpay", "wallet"],
    cashfree: ["UPI, cards & net banking", "All UPI apps, cards, wallets · Cashfree", "wallet"],
    payu: ["UPI, cards & EMI", "UPI, cards, net banking, EMI · PayU", "wallet"],
    stripe: ["Credit or debit card", "Visa, Mastercard, Amex · Stripe", "card"],
    paypal: ["PayPal", "PayPal balance or card", "card"],
  };
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
          addressLines(a).map(function (l) { return "<span>" + esc(l) + "</span>"; }).join("") + "</span></label>";
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

  function viewPayment() {
    var a = st.address;
    var methods = ONE.methods || [];
    var html =
      '<div class="oy-1c__chip oy-1c__chip--addr">' + ICON1.pin + "<span><strong>" + esc(a.name) + "</strong><small>" + esc(addressLines(a).join(", ")) + "</small><small>" + esc(prettyPhone(st.phone)) + " · " + esc(st.email) + "</small></span>" +
      '<button type="button" class="oy-1c__link" data-oy-go="address">Change</button></div>' +
      '<div class="oy-1c__label">Pay with</div><div class="oy-1c__pay" role="radiogroup" aria-label="Payment method">';
    methods.forEach(function (m, i) {
      var t = METHOD_TEXT[m.value] || [m.label, "", "card"];
      html +=
        '<label class="oy-1c__opt"><input type="radio" name="paymentMethod" value="' + esc(m.value) + '"' + ((st.method ? st.method === m.value : i === 0) ? " checked" : "") + ">" +
        '<span class="oy-1c__opt-icon">' + ICON1[t[2]] + "</span>" +
        "<span class=\"oy-1c__opt-text\"><strong>" + esc(t[0]) + "</strong>" + (t[1] ? "<small>" + esc(t[1]) + "</small>" : "") + "</span>" +
        (m.testMode ? '<span class="oy-1c__tag">Test mode</span>' : "") + "</label>";
    });
    html +=
      "</div>" +
      '<label class="oy-1c__remember"><input type="checkbox" data-oy-1c-remember' + (st.keep ? " checked" : "") + "> Remember me on this device for faster checkout</label>";
    return { title: "Choose how to pay", sub: "", body: html, cta: "pay" };
  }

  // ── Render ──
  function draw1c(focusSel) {
    var view = { mobile: viewMobile, otp: viewOtp, address: viewAddress, payment: viewPayment }[st.step]();
    var due = lastCart ? (lastCart.due != null ? lastCart.due : lastCart.total) : 0;
    var method = st.method || ((ONE.methods || [])[0] || {}).value;
    var cta = view.cta === "pay" ? (method === "cod" ? "Place order · " + money(due) : ICON.lock + " Pay " + money(due)) : view.cta;
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
    draw1c(focus || { mobile: "[data-oy-phone]", otp: "[data-oy-digit='0']", address: ".oy-1c__input, input[name=oyAddr]:checked", payment: "input[name=paymentMethod]:checked" }[step]);
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
    var method = st.method || ((ONE.methods || [])[0] || {}).value;
    if (!method) return;
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
      oneClick: "1",
      // Where to come back to if the payment doesn't finish.
      returnTo: pagePath(),
    };
    try {
      if (st.keep) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email: data.email, phone: data.phone, shippingName: a.name, shippingAddress1: a.address1, shippingAddress2: a.address2 || "", company: a.company || "", shippingCity: a.city, shippingProvince: a.province, shippingZip: a.zip }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch (x) {}
    try {
      sessionStorage.setItem(RETRY_KEY, JSON.stringify({ phone: st.phone, email: st.email, verified: st.verified, address: a, addresses: st.addresses, method: method }));
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
    // Where we start: a signed-in shopper (their account's details) or this
    // device's last one-click order skips straight to the address step.
    var known = ONE.prefill && ONE.prefill.phone ? ONE.prefill : remembered();
    var saved = [];
    var mine = fromDetails(ONE.prefill) || fromDetails(remembered());
    if (mine) saved.push(mine);
    var phone = known ? tenDigits(known.phone) : "";
    st = {
      step: phone.length === 10 && saved.length ? "address" : "mobile",
      phone: phone.length === 10 ? phone : "",
      verified: false,
      email: (known && known.email) || (ONE.prefill && ONE.prefill.email) || "",
      name: (known && known.shippingName) || "",
      saved: saved,
      addresses: saved.slice(),
      pick: saved.length ? 0 : "new",
      method: null,
      keep: true,
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
      st.method = r.method || null;
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
      if (t.name === "paymentMethod") {
        st.method = t.value;
        var due = lastCart ? (lastCart.due != null ? lastCart.due : lastCart.total) : 0;
        sheet.querySelector(".oy-1c__cta").innerHTML = t.value === "cod" ? "Place order · " + money(due) : ICON.lock + " Pay " + money(due);
      }
      if (t.hasAttribute("data-oy-1c-remember")) st.keep = t.checked;
    });
    // OTP boxes: one digit each, auto-advance, paste fills them all, and
    // the last digit submits.
    form.addEventListener("input", function (e) {
      var t = e.target;
      if (t.hasAttribute("data-oy-phone")) {
        t.value = t.value.replace(/[^\d ]/g, "");
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
