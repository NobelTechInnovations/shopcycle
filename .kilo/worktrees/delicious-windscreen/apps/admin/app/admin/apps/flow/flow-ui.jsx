"use client";

import { Clock, GitBranch, Mail, BellRing, ShoppingCart, Truck, PackageCheck, XCircle, Undo2, UserPlus, ShoppingBag, Zap } from "lucide-react";

/** Pieces shared by the Flow home and the editor: icons, one-line
 * summaries of triggers and steps, the tints that tell steps apart. */

export const TRIGGER_ICON = {
  order_placed: ShoppingCart,
  order_shipped: Truck,
  order_delivered: PackageCheck,
  order_cancelled: XCircle,
  order_refunded: Undo2,
  customer_created: UserPlus,
  checkout_abandoned: ShoppingBag,
};

export const STEP_META = {
  trigger: { icon: Zap, tint: "bg-[#FFF4E0] text-[#B45309]", ring: "ring-[#F5D9A8]" },
  wait: { icon: Clock, tint: "bg-[#EEF2FF] text-[#4338CA]", ring: "ring-[#C7D2FE]" },
  condition: { icon: GitBranch, tint: "bg-[#ECFDF5] text-[#047857]", ring: "ring-[#A7F3D0]" },
  send_email: { icon: Mail, tint: "bg-accent-soft text-accent", ring: "ring-[#D8CCFF]" },
  notify_owner: { icon: BellRing, tint: "bg-[#FDF2F8] text-[#BE185D]", ring: "ring-[#FBCFE8]" },
};

export function StepIcon({ type, size = 16, className = "" }) {
  const meta = STEP_META[type] || STEP_META.trigger;
  const Icon = meta.icon;
  return (
    <span className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${meta.tint} ${className}`}>
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}

export function TriggerIcon({ trigger, size = 16 }) {
  const Icon = TRIGGER_ICON[trigger] || Zap;
  return (
    <span className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${STEP_META.trigger.tint}`}>
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}

const unitLabel = (amount, unit) => `${amount} ${amount === 1 ? unit.replace(/s$/, "") : unit}`;

export function ruleText(rule, catalog) {
  const field = catalog.fields[rule.field];
  if (!field) return "(removed condition)";
  const op = (catalog.ops[field.type] || []).find((o) => o.value === rule.op);
  if (field.type === "boolean") return `${field.label}: ${op?.label || rule.op}`;
  if (["is_empty", "not_empty"].includes(rule.op)) return `${field.label} ${op?.label}`;
  let value = rule.value;
  if (field.type === "choice") value = field.options.find((o) => o.value === rule.value)?.label || rule.value;
  if (field.type === "number" && /₹/.test(field.label)) value = `₹${Number(value).toLocaleString("en-IN")}`;
  return `${field.label.replace(/ \(₹\)$/, "")} ${op?.label || rule.op} ${value === "" ? "…" : value}`;
}

/** One line saying what a step does. */
export function stepSummary(step, catalog) {
  switch (step.type) {
    case "wait":
      return `Wait ${unitLabel(step.amount || 1, step.unit || "days")}`;
    case "condition": {
      const rules = (step.rules || []).map((r) => ruleText(r, catalog));
      if (!rules.length) return "Check… (add a condition)";
      return `Only if ${rules.join(step.match === "any" ? " or " : " and ")}`;
    }
    case "send_email":
      return step.subject ? `Email the customer: “${step.subject}”` : "Email the customer";
    case "notify_owner":
      return step.subject ? `Email me: “${step.subject}”` : "Email me";
    default:
      return step.type;
  }
}

export const stepTitle = (step, catalog) => catalog.stepTypes[step.type]?.label || step.type;

const SHORT = { wait: "Wait", condition: "Condition", send_email: "Email customer", notify_owner: "Email me" };
export const stepShort = (step) => SHORT[step.type] || step.type;

/** The card's main line: what's specific to this step. */
export function stepHeadline(step, catalog) {
  switch (step.type) {
    case "wait":
      return unitLabel(step.amount || 1, step.unit || "days");
    case "condition": {
      const rules = (step.rules || []).map((r) => ruleText(r, catalog));
      return rules.length ? rules.join(step.match === "any" ? " or " : " and ") : "Add a condition";
    }
    case "send_email":
    case "notify_owner":
      return step.subject || "Add a subject";
    default:
      return "";
  }
}

export function newStep(type, catalog, trigger) {
  const id = Math.random().toString(36).slice(2, 10);
  if (type === "wait") return { id, type, amount: 1, unit: "days" };
  if (type === "condition") {
    const subject = catalog.triggers[trigger]?.subject;
    const first = Object.entries(catalog.fields).find(([, f]) => f.subjects.includes(subject));
    const [field, def] = first || [];
    return { id, type, match: "all", rules: field ? [{ field, op: catalog.ops[def.type][0].value, value: def.type === "number" ? 0 : def.type === "choice" ? def.options[0].value : def.type === "text" ? "" : null }] : [] };
  }
  if (type === "send_email") {
    const subject = catalog.triggers[trigger]?.subject;
    return {
      id,
      type,
      subject: subject === "order" ? "About your order #{{order.number}}" : "A note from {{store.name}}",
      heading: "Hi {{customer.first_name}}",
      body: "Write your message here.",
      buttonLabel: subject === "cart" ? "Return to checkout" : subject === "order" ? "View your order" : "Visit the store",
      buttonLink: subject === "cart" ? "recover" : subject === "order" ? "order" : "store",
      buttonUrl: "",
      discountCode: "",
      includeSummary: false,
    };
  }
  return { id, type: "notify_owner", subject: "Flow alert", body: "" };
}

export function relative(iso) {
  if (!iso) return "Never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
