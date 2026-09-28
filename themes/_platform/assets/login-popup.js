/*
 * Oyklane phone sign-in popup — on when the store has the Phone Login app
 * and the shopper is signed out. Account links (the header's account icon,
 * "Sign in", "Create account") open this popup: mobile number → a code by
 * SMS or WhatsApp → for a new number, name and email → signed in. Without
 * JavaScript the links still go to the sign-in page, which asks the same.
 * Config: <script type="application/json" id="oy-login-config">.
 */
(function () {
  "use strict";
  var el = document.getElementById("oy-login-config");
  if (!el) return;
  var cfg;
  try {
    cfg = JSON.parse(el.textContent);
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
  var TARGETS = [cfg.account, cfg.login, cfg.register].map(pathOf);
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var ICON = {
    x: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/></svg>',
  };

  var sheet = null;
  var st = null;
  var timer = null;
  var goTo = null; // where the clicked link was going

  function digits(v) {
    return String(v || "").replace(/\D/g, "");
  }
  function tenDigits(v) {
    var d = digits(v);
    if (d.length === 12 && d.indexOf("91") === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === "0") d = d.slice(1);
    return d;
  }

  function post(body) {
    return fetch(cfg.endpoint, {
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

  function codeBoxes() {
    var html = '<div class="oy-lg__otp" role="group" aria-label="One-time code">';
    for (var i = 0; i < 6; i += 1) {
      // No maxlength: SMS autofill and paste put the whole code in one box.
      html += '<input class="oy-lg__digit" type="text" inputmode="numeric" ' + (i === 0 ? 'autocomplete="one-time-code" ' : 'autocomplete="off" ') + 'aria-label="Digit ' + (i + 1) + '" data-digit="' + i + '">';
    }
    return html + "</div>";
  }

  function view() {
    if (st.step === "code") {
      return {
        title: "Enter your code",
        sub: "Sent to <strong>" + esc(st.shown) + "</strong>" + (st.channel === "whatsapp" ? " on WhatsApp" : " by SMS") + ' <button type="button" class="oy-lg__link" data-go="phone">Edit</button>',
        body: codeBoxes() + '<p class="oy-lg__resend" data-resend></p>',
        cta: "Verify",
      };
    }
    if (st.step === "profile") {
      return {
        title: "Almost done",
        sub: "Your number is confirmed. Add your name and email for order updates.",
        body:
          '<label class="oy-lg__field"><span>Full name</span><input class="oy-lg__input" name="name" autocomplete="name" required maxlength="120" value="' + esc(st.name) + '"></label>' +
          '<label class="oy-lg__field"><span>Email</span><input class="oy-lg__input" type="email" name="email" autocomplete="email" required maxlength="200" placeholder="you@example.com" value="' + esc(st.email) + '"></label>',
        cta: "Continue",
      };
    }
    if (st.step === "email-code") {
      return {
        title: "Confirm your email",
        sub: "You've shopped here before with <strong>" + esc(st.email) + "</strong>. Enter the code we just emailed you.",
        body: codeBoxes(),
        cta: "Confirm and sign in",
      };
    }
    var choose = cfg.channels.length > 1
      ? '<div class="oy-lg__channels" role="radiogroup" aria-label="Send the code by">' +
        cfg.channels.map(function (c) {
          return '<label class="oy-lg__chip"><input type="radio" name="channel" value="' + c + '"' + (st.channel === c ? " checked" : "") + "><span>" + (c === "whatsapp" ? "WhatsApp" : "SMS") + "</span></label>";
        }).join("") + "</div>"
      : "";
    return {
      title: "Sign in with your phone",
      sub: "We'll send a one-time code — no password needed.",
      body:
        '<label class="oy-lg__phone"><span class="oy-lg__cc">🇮🇳 +91</span>' +
        '<input class="oy-lg__input" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="14" placeholder="98765 43210" aria-label="Mobile number" value="' + esc(st.typed) + '"></label>' +
        choose,
      cta: cfg.channels.length === 1 && cfg.channels[0] === "whatsapp" ? "Send code on WhatsApp" : "Send code",
    };
  }

  function draw(focusSel) {
    var v = view();
    sheet.querySelector(".oy-lg__panel").innerHTML =
      '<header class="oy-lg__head">' +
      (st.step !== "phone" ? '<button type="button" class="oy-lg__icon" data-go="phone" aria-label="Back">' + ICON.back + "</button>" : '<span class="oy-lg__brand">' + esc(cfg.storeName || "") + "</span>") +
      '<button type="button" class="oy-lg__icon" data-close aria-label="Close">' + ICON.x + "</button></header>" +
      '<div class="oy-lg__body">' +
      '<span class="oy-lg__badge">' + ICON.phone + "</span>" +
      '<h2 id="oy-lg-title" class="oy-lg__title">' + v.title + "</h2>" +
      '<p class="oy-lg__sub">' + v.sub + "</p>" +
      '<p class="oy-lg__error" role="alert"' + (st.error ? "" : " hidden") + ">" + esc(st.error || "") + "</p>" +
      v.body +
      '<button type="submit" class="oy-lg__cta"' + (st.busy ? " disabled" : "") + ">" + (st.busy ? '<span class="oy-lg__spin" aria-hidden="true"></span> ' + esc(st.busy) : esc(v.cta)) + "</button>" +
      (st.step === "phone" ? '<p class="oy-lg__fine">By continuing you agree to receive a one-time code on this number.</p>' : "") +
      "</div>";
    if (st.step === "code") resendTimer();
    var f = sheet.querySelector(focusSel || "input:not([type=radio])");
    if (f) f.focus();
  }

  function go(step, focus) {
    st.step = step;
    st.error = null;
    st.busy = null;
    draw(focus);
  }
  function fail(msg, focus) {
    st.error = msg;
    st.busy = null;
    draw(focus);
  }

  function resendTimer() {
    clearInterval(timer);
    var node = sheet.querySelector("[data-resend]");
    var tick = function () {
      if (!node || !node.isConnected) return clearInterval(timer);
      var left = Math.max(0, Math.ceil((st.resendAt - Date.now()) / 1000));
      node.innerHTML = left > 0 ? "Resend code in 0:" + (left < 10 ? "0" : "") + left : 'Didn\'t get it? <button type="button" class="oy-lg__link" data-resend-now>Resend code</button>';
      if (!left) clearInterval(timer);
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  function sendCode() {
    st.busy = "Sending code…";
    draw();
    post({ action: "code", phone: "+91" + st.phone, channel: st.channel })
      .then(function (res) {
        st.shown = res.phone || "+91 " + st.phone;
        st.channel = res.channel || st.channel;
        st.resendAt = Date.now() + 30000;
        go("code", "[data-digit='0']");
      })
      .catch(function (err) {
        st.step = "phone";
        fail(err.message);
      });
  }

  function finished() {
    st.busy = "Signing you in…";
    draw();
    // The header, cart and account links now reflect the signed-in shopper.
    location.href = goTo || location.href;
  }

  function submitCode(action, code) {
    st.busy = "Checking…";
    draw();
    post({ action: action, code: code })
      .then(function (res) {
        if (res.done) return finished();
        if (res.profile) return go("profile", "input[name=name]");
        if (res.emailCode) {
          st.email = res.emailCode;
          return go("email-code", "[data-digit='0']");
        }
      })
      .catch(function (err) {
        fail(err.message, "[data-digit='0']");
      });
  }

  function next(form) {
    if (st.busy) return;
    if (st.step === "phone") {
      st.typed = form.elements.phone.value;
      var d = tenDigits(st.typed);
      if (!/^[6-9]\d{9}$/.test(d)) return fail("Enter a valid 10-digit mobile number.");
      st.phone = d;
      var ch = form.querySelector("input[name=channel]:checked");
      if (ch) st.channel = ch.value;
      return sendCode();
    }
    if (st.step === "code" || st.step === "email-code") {
      var code = Array.prototype.map.call(form.querySelectorAll("[data-digit]"), function (b) {
        return b.value;
      }).join("");
      if (code.length !== 6) return fail("Enter all 6 digits of the code.", "[data-digit='0']");
      return submitCode(st.step === "code" ? "verify" : "email-code", code);
    }
    if (st.step === "profile") {
      st.name = form.elements.name.value.trim();
      st.email = form.elements.email.value.trim();
      if (!st.name) return fail("Enter your name.", "input[name=name]");
      if (!form.elements.email.checkValidity() || !st.email) return fail("Enter a valid email.", "input[name=email]");
      st.busy = "Saving…";
      draw();
      post({ action: "profile", name: st.name, email: st.email })
        .then(function (res) {
          if (res.done) return finished();
          if (res.emailCode) {
            st.email = res.emailCode;
            return go("email-code", "[data-digit='0']");
          }
        })
        .catch(function (err) {
          fail(err.message, "input[name=email]");
        });
    }
  }

  function close() {
    if (!sheet) return;
    clearInterval(timer);
    sheet.classList.remove("is-open");
    document.documentElement.classList.remove("oy-lg-open");
    var s = sheet;
    sheet = null;
    setTimeout(function () {
      s.remove();
    }, 200);
  }

  function open(href) {
    goTo = href;
    st = { step: "phone", typed: "", phone: "", channel: cfg.channels[0], name: "", email: "", error: null, busy: null };
    sheet = document.createElement("div");
    sheet.className = "oy-lg";
    sheet.innerHTML = '<div class="oy-lg__scrim" data-close></div><form class="oy-lg__panel" role="dialog" aria-modal="true" aria-labelledby="oy-lg-title" novalidate></form>';
    document.body.appendChild(sheet);
    document.documentElement.classList.add("oy-lg-open");
    var form = sheet.querySelector("form");
    sheet.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) return close();
      if (e.target.closest("[data-go]")) return go("phone");
      if (e.target.closest("[data-resend-now]")) return sendCode();
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      next(form);
    });
    form.addEventListener("input", function (e) {
      var t = e.target;
      if (t.name === "phone") {
        t.value = t.value.replace(/[^\d ]/g, "");
        return;
      }
      if (!t.hasAttribute("data-digit")) return;
      var boxes = form.querySelectorAll("[data-digit]");
      var i = Number(t.getAttribute("data-digit"));
      var d = digits(t.value);
      if (d.length > 1) {
        d.split("").slice(0, 6 - i).forEach(function (c, k) {
          boxes[i + k].value = c;
        });
      } else {
        t.value = d;
      }
      var all = Array.prototype.map.call(boxes, function (b) { return b.value; }).join("");
      if (all.length === 6) return next(form);
      if (d && i < 5) boxes[Math.min(5, i + Math.max(1, d.length))].focus();
    });
    form.addEventListener("keydown", function (e) {
      var t = e.target;
      if (t.hasAttribute && t.hasAttribute("data-digit") && e.key === "Backspace" && !t.value) {
        var prev = form.querySelector("[data-digit='" + (Number(t.getAttribute("data-digit")) - 1) + "']");
        if (prev) {
          prev.value = "";
          prev.focus();
          e.preventDefault();
        }
      }
    });
    draw();
    requestAnimationFrame(function () {
      sheet.classList.add("is-open");
    });
  }

  document.addEventListener(
    "click",
    function (e) {
      var link = e.target.closest && e.target.closest("a[href]");
      if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (TARGETS.indexOf(pathOf(link.href)) === -1) return;
      e.preventDefault();
      e.stopPropagation();
      // Afterwards: back to checkout/cart if the link says so, else the
      // account page.
      var back = null;
      try {
        back = (cfg.returns || {})[new URL(link.href, location.href).searchParams.get("return_to")];
      } catch (x) {}
      open(back || cfg.account);
    },
    true
  );
  document.addEventListener("keydown", function (e) {
    if (sheet && e.key === "Escape") close();
  });
})();
