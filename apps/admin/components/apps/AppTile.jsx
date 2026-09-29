"use client";

import { AppIcon } from "@shopcycle/ui";

// Each category gets its own soft tint on the app's icon tile.
const TINT = {
  automation: "from-[#EDE8FF] to-[#E3F7F4] text-[#5B3FE0]",
  checkout: "from-[#E3F7F4] to-[#E8F1FF] text-[#0F8B7A]",
  customers: "from-[#FFF1E6] to-[#FFE9EF] text-[#C2410C]",
  marketing: "from-[#FFE9EF] to-[#EDE8FF] text-[#BE185D]",
  analytics: "from-[#E8F1FF] to-[#EDE8FF] text-[#1D4ED8]",
  utility: "from-[#F1F1F4] to-[#E9E9EE] text-ink",
  other: "from-[#F1F1F4] to-[#E9E9EE] text-ink",
};

export function AppTile({ app, size = 44 }) {
  return (
    <span
      className={`shrink-0 rounded-[12px] bg-gradient-to-br ${TINT[app.category] || TINT.other} flex items-center justify-center border border-white shadow-[0_1px_2px_rgba(17,17,20,0.06)]`}
      style={{ width: size, height: size }}
    >
      <AppIcon iconKey={app.iconKey} size={Math.round(size * 0.45)} />
    </span>
  );
}
