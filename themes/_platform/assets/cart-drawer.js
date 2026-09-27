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
      '<a class="oy-btn oy-btn--block" href="' + esc(cfg.checkout) + '">' + ICON.lock + " Checkout · " + money(cart.total) + "</a>" +
      '<a class="oy-btn oy-btn--ghost oy-btn--block" href="' + esc(cfg.cart) + '" data-oy-full>View cart</a>';
  }

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
    if (root.hidden) return;
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
