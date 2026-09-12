"use client";

import {
  BarChart3,
  Activity,
  Code2,
  Star,
  Megaphone,
  MessageCircle,
  Mail,
  Truck,
  CreditCard,
  Percent,
  Search,
  Puzzle,
} from "lucide-react";
import { APP_ICON_KEYS } from "@shopcycle/utils";

// Every key in @shopcycle/utils's APP_ICON_KEYS mapped to a real lucide
// component — that shared, framework-agnostic list is the whitelist Zod
// validates App.iconKey against (packages/validation), so it's imported
// here rather than redeclared, to keep the two from drifting apart. This
// map is the one place that needs to know which actual icon each key
// renders as.
const ICON_COMPONENTS = {
  "bar-chart": BarChart3,
  activity: Activity,
  code: Code2,
  star: Star,
  megaphone: Megaphone,
  "message-circle": MessageCircle,
  mail: Mail,
  truck: Truck,
  "credit-card": CreditCard,
  percent: Percent,
  search: Search,
  puzzle: Puzzle,
};

export const APP_ICONS = ICON_COMPONENTS;
export const APP_ICON_OPTIONS = APP_ICON_KEYS;

/** Renders one of APP_ICONS by key — the one place that ever needs to
 * know the fallback is "puzzle", so a bad/missing key never crashes a
 * render, it just looks generic. */
export function AppIcon({ iconKey, size = 20, className }) {
  const Icon = APP_ICONS[iconKey] || Puzzle;
  return <Icon size={size} className={className} aria-hidden="true" />;
}
