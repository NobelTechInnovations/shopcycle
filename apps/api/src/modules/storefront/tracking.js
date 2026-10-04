/**
 * Facebook Pixel and Google Analytics on every store page — including
 * checkout and the order confirmation, which don't use the theme's layout
 * — added by the platform rather than left to each theme. Base code goes
 * in <head> once (skipped if a theme's own snippet already printed it),
 * then the standard shopping events:
 *
 *   product page        ViewContent       view_item
 *   add to cart         AddToCart         add_to_cart      (cart-drawer.js)
 *   checkout            InitiateCheckout  begin_checkout
 *   order confirmation  Purchase          purchase         (once per order)
 *   search              Search            search
 *
 * window.oyTrack(name, data) sends one event to whichever are installed.
 */

const PIXEL_ID = /^\d{6,20}$/;
const GA_ID = /^(G|AW|GT)-[A-Z0-9]{4,20}$/i;

// JSON inside <script>: "<" escaped so a value can't close the tag.
const js = (value) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, "");

function pixelBase(id) {
  return (
    `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};` +
    `if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];` +
    `s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
    `fbq('init',${js(id)});fbq('track','PageView');</script>` +
    `<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${id}&amp;ev=PageView&amp;noscript=1"></noscript>`
  );
}

function gaBase(id) {
  return (
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}"></script>` +
    `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${js(id)});</script>`
  );
}

// Pixel event → GA4 event, with the parameters each expects.
const HELPER = `<script>(function(){var GA={ViewContent:"view_item",AddToCart:"add_to_cart",InitiateCheckout:"begin_checkout",Purchase:"purchase",Search:"search"};
window.oyTrack=function(name,d){d=d||{};try{
if(window.fbq){var p={};if(d.ids)p.content_ids=d.ids,p.content_type="product";if(d.name)p.content_name=d.name;if(d.value!=null)p.value=d.value;if(d.currency)p.currency=d.currency;if(d.count)p.num_items=d.count;if(d.query)p.search_string=d.query;fbq("track",name,p,d.eventId?{eventID:d.eventId}:undefined);}
if(window.gtag&&GA[name]){var g={};if(d.currency)g.currency=d.currency;if(d.value!=null)g.value=d.value;if(d.items)g.items=d.items;if(d.orderId)g.transaction_id=d.orderId;if(d.query)g.search_term=d.query;gtag("event",GA[name],g);}
}catch(e){}};})();</script>`;

const num = (v) => Math.round(Number(v || 0) * 100) / 100;

/** The event this page fires on load, if any. */
function pageEvent(templateName, ctx, currency) {
  if (templateName === "product" && ctx.product) {
    const p = ctx.product;
    const price = num(p.selected_variant?.price ?? p.price);
    return { name: "ViewContent", data: { ids: [p.id], name: p.title, value: price, currency, items: [{ item_id: p.id, item_name: p.title, price }] } };
  }
  if (templateName === "checkout" && ctx.cart?.items?.length) {
    const items = ctx.cart.items;
    return {
      name: "InitiateCheckout",
      data: {
        ids: items.map((i) => i.productId),
        value: num(ctx.cart.total),
        currency,
        count: items.reduce((n, i) => n + i.quantity, 0),
        items: items.map((i) => ({ item_id: i.productId, item_name: i.title, price: num(i.price), quantity: i.quantity })),
      },
    };
  }
  if (templateName === "order-confirmation" && ctx.order) {
    const o = ctx.order;
    const items = o.items || [];
    return {
      name: "Purchase",
      once: `oy-purchase-${o.id || o.orderNumber}`,
      data: {
        ids: items.map((i) => i.productId).filter(Boolean),
        value: num(o.total),
        currency,
        count: items.reduce((n, i) => n + (i.quantity || 0), 0),
        orderId: String(o.orderNumber || o.id),
        eventId: `order-${o.id || o.orderNumber}`,
        items: items.map((i) => ({ item_id: i.productId || i.variantId, item_name: i.title, price: num(i.price), quantity: i.quantity })),
      },
    };
  }
  if (templateName === "search" && ctx.search?.query) {
    return { name: "Search", data: { query: String(ctx.search.query).slice(0, 100) } };
  }
  return null;
}

/**
 * What goes before </head>: base code for the installed trackers the
 * page doesn't already have, the oyTrack helper, and this page's event.
 * Empty when neither app is installed.
 */
function trackingTags({ apps, templateName, ctx, currency, html }) {
  const pixelId = String(apps?.["facebook-pixel"]?.pixelId || "").trim();
  const gaId = String(apps?.["google-analytics"]?.measurementId || "").trim();
  const hasPixel = PIXEL_ID.test(pixelId);
  const hasGa = GA_ID.test(gaId);
  if (!hasPixel && !hasGa) return "";
  let out = "";
  if (hasPixel && !html.includes("connect.facebook.net/en_US/fbevents.js")) out += pixelBase(pixelId);
  if (hasGa && !html.includes("googletagmanager.com/gtag/js")) out += gaBase(gaId);
  out += HELPER;
  const ev = pageEvent(templateName, ctx, currency);
  if (ev) {
    const fire = `oyTrack(${js(ev.name)},${js(ev.data)})`;
    out += ev.once
      ? `<script>try{if(!localStorage.getItem(${js(ev.once)})){${fire};localStorage.setItem(${js(ev.once)},"1")}}catch(e){${fire}}</script>`
      : `<script>${fire}</script>`;
  }
  return out;
}

module.exports = { trackingTags, pageEvent, PIXEL_ID, GA_ID };
