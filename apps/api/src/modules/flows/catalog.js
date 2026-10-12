const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { ICON_CHOICES, iconUrl } = require("../../emails/assets");

/**
 * What a Flow can be made of — the triggers that start one, the facts a
 * Condition step can check, the step types, and the ready-made recipes a
 * seller starts from. The admin's builder renders straight from this, so
 * adding a field or a recipe here is all it takes.
 */

const TRIGGERS = {
  order_placed: {
    label: "Order placed",
    hint: "Cash on delivery orders right away; online orders once the payment goes through.",
    subject: "order",
    events: ["order.created", "order.paid"],
  },
  payment_pending: {
    label: "Payment pending",
    hint: "An online or UPI order is waiting for the customer to pay. Add a Wait and a \"payment received\" check so it stops once they pay.",
    subject: "order",
    events: ["order.created"],
    pendingOnly: true,
  },
  order_shipped: { label: "Order shipped", hint: "When you mark the order (or its first part) as shipped.", subject: "order", events: ["order.fulfilled"] },
  order_delivered: { label: "Order delivered", hint: "When a shipment is marked delivered.", subject: "order", events: ["order.delivered"] },
  order_cancelled: { label: "Order cancelled", hint: "When an order is cancelled.", subject: "order", events: ["order.cancelled"] },
  order_refunded: { label: "Order refunded", hint: "When money is refunded on an order.", subject: "order", events: ["order.refunded"] },
  customer_created: { label: "Customer signed up", hint: "The first time a customer appears in your store.", subject: "customer", events: ["customer.created"] },
  checkout_abandoned: {
    label: "Checkout abandoned",
    hint: "A shopper gave their email at checkout but didn't order (after your abandoned-checkout delay).",
    subject: "cart",
    events: ["checkout.abandoned"],
  },
};

const ANY = ["order", "customer", "cart"];
const FIELDS = {
  "order.total": { label: "Order total (₹)", type: "number", subjects: ["order"] },
  "order.items_count": { label: "Number of items", type: "number", subjects: ["order"] },
  "order.payment_method": {
    label: "Payment",
    type: "choice",
    options: [
      { value: "cod", label: "Cash on delivery" },
      { value: "online", label: "Paid online" },
    ],
    subjects: ["order"],
  },
  "order.is_first_order": { label: "It's the customer's first order", type: "boolean", subjects: ["order"] },
  "order.discount_code": { label: "Discount code used", type: "text", subjects: ["order"] },
  "order.product_titles": { label: "Products in the order", type: "text", subjects: ["order"] },
  "order.shipping_state": { label: "Shipping state", type: "text", subjects: ["order"] },
  "order.shipping_city": { label: "Shipping city", type: "text", subjects: ["order"] },
  "order.is_cancelled": { label: "The order is cancelled", type: "boolean", subjects: ["order"] },
  "order.is_refunded": { label: "The order is refunded", type: "boolean", subjects: ["order"] },
  "order.is_delivered": { label: "The order is delivered", type: "boolean", subjects: ["order"] },
  "order.is_paid": { label: "The order is paid", type: "boolean", subjects: ["order"] },
  "cart.total": { label: "Checkout total (₹)", type: "number", subjects: ["cart"] },
  "cart.items_count": { label: "Items in the checkout", type: "number", subjects: ["cart"] },
  "cart.recovered": { label: "They came back to the checkout", type: "boolean", subjects: ["cart"] },
  "customer.accepts_marketing": { label: "Customer accepts marketing emails", type: "boolean", subjects: ANY },
  "customer.orders_count": { label: "Customer's number of orders", type: "number", subjects: ANY },
  "customer.total_spent": { label: "Customer's total spent (₹)", type: "number", subjects: ANY },
  "customer.ordered_since": { label: "Customer ordered again since this started", type: "boolean", subjects: ANY },
  "customer.has_phone": { label: "Customer has a phone number", type: "boolean", subjects: ANY },
  "customer.accepts_whatsapp": { label: "Customer agreed to WhatsApp marketing", type: "boolean", subjects: ANY },
};

const OPS = {
  number: [
    { value: "gte", label: "is at least" },
    { value: "gt", label: "is more than" },
    { value: "lte", label: "is at most" },
    { value: "lt", label: "is less than" },
    { value: "eq", label: "is exactly" },
    { value: "neq", label: "isn't" },
  ],
  text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "is", label: "is" },
    { value: "is_not", label: "isn't" },
    { value: "is_empty", label: "is empty" },
    { value: "not_empty", label: "isn't empty" },
  ],
  choice: [
    { value: "is", label: "is" },
    { value: "is_not", label: "isn't" },
  ],
  boolean: [
    { value: "is_true", label: "yes" },
    { value: "is_false", label: "no" },
  ],
};

const STEP_TYPES = {
  wait: { label: "Wait", hint: "Pause before the next step." },
  condition: { label: "Check a condition", hint: "Carry on only if these are true — otherwise stop here." },
  send_email: { label: "Email the customer", hint: "Sent from your store's name; replies come to your support email." },
  notify_owner: { label: "Email me", hint: "A note to you (and your support email)." },
  send_whatsapp: {
    label: "WhatsApp the customer",
    hint: "Sends one of your Meta-approved templates. Marketing templates only go to customers who agreed to WhatsApp messages; anyone who replied STOP is skipped.",
  },
};

const VARIABLES = [
  { key: "customer.first_name", label: "Customer's first name", subjects: ANY },
  { key: "customer.name", label: "Customer's full name", subjects: ANY },
  { key: "customer.email", label: "Customer's email", subjects: ANY },
  { key: "order.number", label: "Order number", subjects: ["order"] },
  { key: "order.total", label: "Order total", subjects: ["order"] },
  { key: "order.first_item", label: "First product in the order", subjects: ["order"] },
  { key: "order.items_count", label: "Number of items", subjects: ["order"] },
  { key: "order.courier", label: "Courier", subjects: ["order"] },
  { key: "order.tracking_number", label: "Tracking number", subjects: ["order"] },
  { key: "cart.total", label: "Checkout total", subjects: ["cart"] },
  { key: "cart.first_item", label: "First product in the checkout", subjects: ["cart"] },
  { key: "store.name", label: "Your store's name", subjects: ANY },
  { key: "discount_code", label: "The step's discount code", subjects: ANY },
];

const LINKS = {
  order: { label: "Their order page", subjects: ["order"] },
  store: { label: "Your store", subjects: ANY },
  recover: { label: "Back to their checkout", subjects: ["cart"] },
  custom: { label: "A link you choose", subjects: ANY },
};

const MAX_STEPS = 20;
const UNIT_MS = { minutes: 60 * 1000, hours: 60 * 60 * 1000, days: 24 * 60 * 60 * 1000 };
const MAX_WAIT_MS = 90 * UNIT_MS.days;

const newId = () => crypto.randomBytes(6).toString("base64url");
const str = (v, max) => String(v ?? "").trim().slice(0, max);

/** What a WhatsApp step's {{1}}, {{2}}… and button link can be filled with. */
const WA_SOURCES = [
  { key: "customer.first_name", label: "Customer's first name", subjects: ANY },
  { key: "customer.name", label: "Customer's full name", subjects: ANY },
  { key: "store.name", label: "Your store's name", subjects: ANY },
  { key: "order.number", label: "Order number", subjects: ["order"] },
  { key: "order.total", label: "Order total", subjects: ["order"] },
  { key: "order.first_item", label: "First product in the order", subjects: ["order"] },
  { key: "order.courier", label: "Courier", subjects: ["order"] },
  { key: "order.tracking_number", label: "Tracking number", subjects: ["order"] },
  { key: "order.status_token", label: "Order page code (for a link ending in {{1}})", subjects: ["order"] },
  { key: "cart.total", label: "Checkout total", subjects: ["cart"] },
  { key: "cart.first_item", label: "First product in the checkout", subjects: ["cart"] },
  { key: "cart.recovery_token", label: "Checkout link code (for a link ending in {{1}})", subjects: ["cart"] },
  { key: "text", label: "Fixed text", subjects: ANY },
];

function cleanSource(v, subject) {
  const src = WA_SOURCES.find((x) => x.key === v?.source && x.subjects.includes(subject));
  if (!src) return null;
  return { source: src.key, value: src.key === "text" ? str(v.value, 300) : "" };
}

function cleanRule(rule, subject) {
  const field = FIELDS[rule?.field];
  if (!field || !field.subjects.includes(subject)) return null;
  const ops = OPS[field.type].map((o) => o.value);
  const op = ops.includes(rule.op) ? rule.op : ops[0];
  let value = null;
  if (field.type === "number") value = Number.isFinite(Number(rule.value)) ? Number(rule.value) : 0;
  else if (field.type === "choice") value = field.options.some((o) => o.value === rule.value) ? rule.value : field.options[0].value;
  else if (field.type === "text") value = str(rule.value, 200);
  return { field: rule.field, op, value };
}

/** Checks and tidies a flow's steps for its trigger. Throws on anything a
 * seller has to fix; drops what the builder never sends. */
function cleanSteps(steps, trigger) {
  const subject = TRIGGERS[trigger].subject;
  if (!Array.isArray(steps)) throw new HttpError(400, "Steps must be a list.");
  if (steps.length > MAX_STEPS) throw new HttpError(400, `A flow can have up to ${MAX_STEPS} steps.`);
  const seen = new Set();
  return steps.map((s, i) => {
    const n = `Step ${i + 1}`;
    let id = str(s?.id, 24) || newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    switch (s?.type) {
      case "wait": {
        const unit = UNIT_MS[s.unit] ? s.unit : "days";
        const amount = Math.max(1, Math.floor(Number(s.amount) || 1));
        if (amount * UNIT_MS[unit] > MAX_WAIT_MS) throw new HttpError(400, `${n}: a wait can be up to 90 days.`);
        return { id, type: "wait", amount, unit };
      }
      case "condition": {
        const rules = (Array.isArray(s.rules) ? s.rules : []).map((r) => cleanRule(r, subject)).filter(Boolean).slice(0, 10);
        if (!rules.length) throw new HttpError(400, `${n}: add at least one condition.`);
        // What happens when it isn't met: stop (default), skip the next
        // step, or jump to a later step (simple branching).
        const otherwise = ["stop", "skip", "goto"].includes(s.otherwise) ? s.otherwise : "stop";
        return { id, type: "condition", match: s.match === "any" ? "any" : "all", rules, otherwise, gotoStepId: otherwise === "goto" ? str(s.gotoStepId, 24) : "" };
      }
      case "send_email": {
        const subjectLine = str(s.subject, 200);
        const body = str(s.body, 5000);
        if (!subjectLine) throw new HttpError(400, `${n}: the email needs a subject.`);
        if (!body) throw new HttpError(400, `${n}: the email needs a message.`);
        const buttonLink = LINKS[s.buttonLink]?.subjects.includes(subject) ? s.buttonLink : "";
        const buttonUrl = str(s.buttonUrl, 500);
        if (buttonLink === "custom" && !/^https:\/\//i.test(buttonUrl)) throw new HttpError(400, `${n}: the button's link must start with https://`);
        return {
          id,
          type: "send_email",
          subject: subjectLine,
          heading: str(s.heading, 200),
          body,
          buttonLabel: buttonLink ? str(s.buttonLabel, 60) || "Shop now" : "",
          buttonLink,
          buttonUrl: buttonLink === "custom" ? buttonUrl : "",
          discountCode: str(s.discountCode, 40).toUpperCase(),
          includeSummary: subject !== "customer" && Boolean(s.includeSummary),
          // Design: a picture at the top (an icon in the store's colour)
          // and an optional banner image.
          icon: ICON_CHOICES.includes(s.icon) ? s.icon : "",
          banner: /^https:\/\/[^\s"'<>]+$/i.test(str(s.banner, 1000)) ? str(s.banner, 1000) : "",
        };
      }
      case "notify_owner": {
        const subjectLine = str(s.subject, 200);
        if (!subjectLine) throw new HttpError(400, `${n}: the note needs a subject.`);
        return { id, type: "notify_owner", subject: subjectLine, body: str(s.body, 3000) };
      }
      case "send_whatsapp": {
        const templateName = str(s.templateName, 512);
        if (!/^[a-z0-9_]+$/.test(templateName)) throw new HttpError(400, `${n}: choose an approved WhatsApp template.`);
        const variables = (Array.isArray(s.variables) ? s.variables : []).slice(0, 20).map((v) => cleanSource(v, subject) || { source: "text", value: str(v?.value, 300) });
        const headerMediaUrl = str(s.headerMediaUrl, 1000);
        if (headerMediaUrl && !/^https:\/\//i.test(headerMediaUrl)) throw new HttpError(400, `${n}: the header file's link must start with https://`);
        return {
          id,
          type: "send_whatsapp",
          templateName,
          language: str(s.language, 10) || "en",
          category: ["MARKETING", "UTILITY"].includes(s.category) ? s.category : "UTILITY",
          variables,
          headerMediaUrl,
          button: cleanSource(s.button, subject),
        };
      }
      default:
        throw new HttpError(400, `${n}: unknown step.`);
    }
  });
}

function cleanFlow(input, { partial = false } = {}) {
  const out = {};
  if (!partial || input.name !== undefined) {
    out.name = str(input.name, 120);
    if (!out.name) throw new HttpError(400, "Give the flow a name.");
  }
  if (!partial || input.trigger !== undefined) {
    if (!TRIGGERS[input.trigger]) throw new HttpError(400, "Choose what starts the flow.");
    out.trigger = input.trigger;
  }
  if (input.enabled !== undefined) out.enabled = Boolean(input.enabled);
  if (input.settings !== undefined) out.settings = cleanSettings(input.settings);
  return out;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Quiet hours (no WhatsApp at night — it waits until morning), how often
 * one customer may get this flow's WhatsApp messages, and test mode
 * (every message goes to the seller instead of customers). */
function cleanSettings(v = {}) {
  const q = v.quietHours || {};
  return {
    quietHours: { enabled: Boolean(q.enabled), from: HHMM.test(q.from) ? q.from : "21:00", to: HHMM.test(q.to) ? q.to : "09:00" },
    maxPerCustomerDays: Math.max(0, Math.min(60, Math.floor(Number(v.maxPerCustomerDays) || 0))),
    testMode: Boolean(v.testMode),
    testPhone: str(v.testPhone, 20),
    testEmail: str(v.testEmail, 200),
  };
}

const email = (o) => ({ type: "send_email", buttonLabel: "", buttonLink: "", buttonUrl: "", discountCode: "", includeSummary: false, heading: "", ...o });
const whatsapp = (o) => ({ type: "send_whatsapp", language: "en", category: "UTILITY", variables: [], headerMediaUrl: "", button: null, ...o });
const QUIET = { quietHours: { enabled: true, from: "21:00", to: "09:00" } };

/** Ready-made flows — a seller picks one, reads it, turns it on. */
const RECIPES = [
  {
    key: "wa_order_confirmation",
    name: "WhatsApp order confirmation",
    category: "WhatsApp",
    channel: "whatsapp",
    description: "Confirms every order on WhatsApp with its number and a link to the order page. Uses your \"order_confirmed\" template.",
    trigger: "order_placed",
    settings: QUIET,
    steps: [
      { type: "condition", match: "all", rules: [{ field: "customer.has_phone", op: "is_true", value: null }] },
      whatsapp({ templateName: "order_confirmed", variables: [{ source: "customer.first_name" }, { source: "order.number" }], button: { source: "order.status_token" } }),
    ],
  },
  {
    key: "wa_shipped",
    name: "WhatsApp shipping update",
    category: "WhatsApp",
    channel: "whatsapp",
    description: "Tells the customer their order is on its way, with the courier and tracking link. Uses your \"order_shipped\" template.",
    trigger: "order_shipped",
    settings: QUIET,
    steps: [whatsapp({ templateName: "order_shipped", variables: [{ source: "customer.first_name" }, { source: "order.number" }, { source: "order.courier" }], button: { source: "order.status_token" } })],
  },
  {
    key: "wa_payment_reminder",
    name: "WhatsApp payment reminder",
    category: "WhatsApp",
    channel: "whatsapp",
    description: "30 minutes after an unpaid online order, a reminder with a link to pay — stops as soon as they pay. Uses your \"payment_pending\" template.",
    trigger: "payment_pending",
    settings: QUIET,
    steps: [
      { type: "wait", amount: 30, unit: "minutes" },
      { type: "condition", match: "all", rules: [{ field: "order.is_paid", op: "is_false", value: null }, { field: "order.is_cancelled", op: "is_false", value: null }] },
      whatsapp({ templateName: "payment_pending", variables: [{ source: "customer.first_name" }, { source: "order.number" }], button: { source: "order.status_token" } }),
    ],
  },
  {
    key: "wa_abandoned",
    name: "WhatsApp abandoned-checkout reminder",
    category: "WhatsApp",
    channel: "whatsapp",
    description: "An hour after a checkout is left, a WhatsApp nudge with a link back — only to customers who agreed to WhatsApp, and never once they've ordered. Uses your \"checkout_reminder\" template.",
    trigger: "checkout_abandoned",
    settings: { ...QUIET, maxPerCustomerDays: 7 },
    steps: [
      { type: "wait", amount: 1, unit: "hours" },
      {
        type: "condition",
        match: "all",
        rules: [
          { field: "cart.recovered", op: "is_false", value: null },
          { field: "customer.ordered_since", op: "is_false", value: null },
          { field: "customer.accepts_whatsapp", op: "is_true", value: null },
        ],
      },
      whatsapp({ templateName: "checkout_reminder", category: "MARKETING", variables: [{ source: "customer.first_name" }, { source: "store.name" }], button: { source: "cart.recovery_token" } }),
    ],
  },
  {
    key: "wa_feedback",
    name: "WhatsApp feedback after delivery",
    category: "WhatsApp",
    channel: "whatsapp",
    description: "Two days after delivery, asks how it went with quick-reply buttons. Uses your \"delivery_feedback\" template.",
    trigger: "order_delivered",
    settings: QUIET,
    steps: [
      { type: "wait", amount: 2, unit: "days" },
      { type: "condition", match: "all", rules: [{ field: "order.is_refunded", op: "is_false", value: null }, { field: "customer.accepts_whatsapp", op: "is_true", value: null }] },
      whatsapp({ templateName: "delivery_feedback", category: "MARKETING", variables: [{ source: "customer.first_name" }] }),
    ],
  },
  {
    key: "wa_replenish",
    name: "WhatsApp reorder reminder",
    category: "WhatsApp",
    channel: "whatsapp",
    description: "30 days after delivery — when they're likely running out — a reminder to reorder, if they haven't already. Opted-in customers only.",
    trigger: "order_delivered",
    settings: { ...QUIET, maxPerCustomerDays: 20 },
    steps: [
      { type: "wait", amount: 30, unit: "days" },
      { type: "condition", match: "all", rules: [{ field: "customer.ordered_since", op: "is_false", value: null }, { field: "customer.accepts_whatsapp", op: "is_true", value: null }] },
      whatsapp({ templateName: "reorder_reminder", category: "MARKETING", variables: [{ source: "customer.first_name" }, { source: "order.first_item" }] }),
    ],
  },
  {
    key: "first_order_thanks",
    name: "Thank first-time buyers",
    category: "Loyalty",
    description: "A warm thank-you an hour after someone's first order, with a code for their next one.",
    trigger: "order_placed",
    steps: [
      { type: "condition", match: "all", rules: [{ field: "order.is_first_order", op: "is_true", value: null }] },
      { type: "wait", amount: 1, unit: "hours" },
      email({
        subject: "Thank you for your first order, {{customer.first_name}}!",
        heading: "Welcome to {{store.name}}",
        body: "Hi {{customer.first_name}},\n\nThank you for choosing us — your order #{{order.number}} is in good hands and we'll let you know the moment it ships.\n\nAs a thank-you, here's a code for your next order: {{discount_code}}",
        buttonLabel: "View your order",
        buttonLink: "order",
        discountCode: "THANKYOU10",
      }),
    ],
  },
  {
    key: "review_request",
    name: "Ask for a review after delivery",
    category: "Reviews",
    description: "Three days after an order is delivered, ask how it went — while it's fresh.",
    trigger: "order_delivered",
    steps: [
      { type: "wait", amount: 3, unit: "days" },
      { type: "condition", match: "all", rules: [{ field: "order.is_refunded", op: "is_false", value: null }] },
      email({
        subject: "How are you finding your {{order.first_item}}?",
        heading: "How did we do?",
        body: "Hi {{customer.first_name}},\n\nYour order #{{order.number}} arrived a few days ago — we'd love to know what you think. A quick review helps other shoppers and helps us get better.\n\nThank you!",
        buttonLabel: "Write a review",
        buttonLink: "order",
      }),
    ],
  },
  {
    key: "cod_confirmation",
    name: "Confirm cash on delivery orders",
    category: "Orders",
    description: "Reminds cash-on-delivery buyers of the amount to keep ready — fewer refused deliveries.",
    trigger: "order_placed",
    steps: [
      { type: "condition", match: "all", rules: [{ field: "order.payment_method", op: "is", value: "cod" }] },
      email({
        subject: "Please keep {{order.total}} ready for order #{{order.number}}",
        heading: "Your order is confirmed",
        body: "Hi {{customer.first_name}},\n\nYou chose cash on delivery for order #{{order.number}}. Please keep {{order.total}} ready when it arrives.\n\nIf you didn't place this order or want to change something, just reply to this email.",
        buttonLabel: "View your order",
        buttonLink: "order",
        includeSummary: true,
      }),
    ],
  },
  {
    key: "win_back",
    name: "Win back customers",
    category: "Marketing",
    description: "If someone hasn't ordered again 45 days after their last order, send a code to bring them back.",
    trigger: "order_placed",
    steps: [
      { type: "wait", amount: 45, unit: "days" },
      {
        type: "condition",
        match: "all",
        rules: [
          { field: "customer.ordered_since", op: "is_false", value: null },
          { field: "customer.accepts_marketing", op: "is_true", value: null },
        ],
      },
      email({
        subject: "We miss you, {{customer.first_name}}",
        heading: "It's been a while",
        body: "Hi {{customer.first_name}},\n\nWe've added new things since your last order and thought you'd like a look. Here's a little something to welcome you back: {{discount_code}}",
        buttonLabel: "Shop now",
        buttonLink: "store",
        discountCode: "COMEBACK15",
      }),
    ],
  },
  {
    key: "abandoned_follow_up",
    name: "Second abandoned-checkout reminder",
    category: "Recovery",
    description: "A day after the first reminder, one more nudge — only if they haven't come back or ordered.",
    trigger: "checkout_abandoned",
    steps: [
      { type: "wait", amount: 1, unit: "days" },
      {
        type: "condition",
        match: "all",
        rules: [
          { field: "cart.recovered", op: "is_false", value: null },
          { field: "customer.ordered_since", op: "is_false", value: null },
        ],
      },
      email({
        subject: "Your {{cart.first_item}} is still waiting",
        heading: "Still thinking it over?",
        body: "Hi {{customer.first_name}},\n\nYou left a few things in your cart. We've saved it for you — pick up right where you left off.",
        buttonLabel: "Return to checkout",
        buttonLink: "recover",
        includeSummary: true,
      }),
    ],
  },
  {
    key: "welcome",
    name: "Welcome new customers",
    category: "Marketing",
    description: "Say hello to customers who signed up for your emails, with a code for their first order.",
    trigger: "customer_created",
    steps: [
      { type: "condition", match: "all", rules: [{ field: "customer.accepts_marketing", op: "is_true", value: null }] },
      email({
        subject: "Welcome to {{store.name}}!",
        heading: "Glad you're here, {{customer.first_name}}",
        body: "Thanks for joining us. You'll be the first to hear about new arrivals and offers.\n\nHere's a code to get you started: {{discount_code}}",
        buttonLabel: "Start shopping",
        buttonLink: "store",
        discountCode: "WELCOME10",
      }),
    ],
  },
  {
    key: "big_order_alert",
    name: "Tell me about big orders",
    category: "Alerts",
    description: "An email to you whenever an order is ₹5,000 or more — so you can give it extra care.",
    trigger: "order_placed",
    steps: [
      { type: "condition", match: "all", rules: [{ field: "order.total", op: "gte", value: 5000 }] },
      { type: "notify_owner", subject: "Big order #{{order.number}} — {{order.total}}", body: "{{customer.name}} just placed order #{{order.number}} for {{order.total}}. Worth an extra look before it ships." },
    ],
  },
  {
    key: "cancelled_come_back",
    name: "Bring back cancelled orders",
    category: "Recovery",
    description: "An hour after an order is cancelled, a friendly note and a code in case they still want it.",
    trigger: "order_cancelled",
    steps: [
      { type: "wait", amount: 1, unit: "hours" },
      { type: "condition", match: "all", rules: [{ field: "customer.ordered_since", op: "is_false", value: null }] },
      email({
        subject: "Sorry to see order #{{order.number}} go",
        heading: "Still want it?",
        body: "Hi {{customer.first_name}},\n\nYour order #{{order.number}} was cancelled. If you'd still like it, here's a code for 10% off: {{discount_code}}",
        buttonLabel: "Shop again",
        buttonLink: "store",
        discountCode: "SORRY10",
      }),
    ],
  },
];

function recipe(key) {
  const r = RECIPES.find((x) => x.key === key);
  if (!r) throw new HttpError(404, "That recipe doesn't exist.");
  return { name: r.name, trigger: r.trigger, templateKey: r.key, settings: cleanSettings(r.settings || {}), steps: cleanSteps(r.steps.map((s) => ({ ...s, id: newId() })), r.trigger) };
}

/** Everything the admin's builder needs, in one object. */
function builderCatalog() {
  return {
    triggers: TRIGGERS,
    fields: FIELDS,
    ops: OPS,
    stepTypes: STEP_TYPES,
    variables: VARIABLES,
    links: LINKS,
    recipes: RECIPES,
    waSources: WA_SOURCES,
    maxSteps: MAX_STEPS,
    // Pictures for the top of an email (white on the store's colour).
    icons: ICON_CHOICES.map((key) => ({ key, url: iconUrl(key, { dark: true }) })),
  };
}

module.exports = { TRIGGERS, FIELDS, OPS, STEP_TYPES, VARIABLES, LINKS, RECIPES, UNIT_MS, WA_SOURCES, cleanSteps, cleanFlow, cleanSettings, recipe, builderCatalog, newId };
