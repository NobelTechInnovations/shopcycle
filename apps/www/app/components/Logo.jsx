import { BRANDS } from "../data/brand-logos";
import { Icon, I } from "./Icon";

/* Wordmarks for brands Simple Icons doesn't carry, in their own colours. */
const WORDMARKS = {
  cashfree: { text: "cashfree", color: "#6933D3" },
  payu: { text: "PayU", color: "#7BB83B" },
  upi: { text: "UPI", color: "#097939", accent: "#ED752E" },
  rupay: { text: "RuPay", color: "#1B4B9B", accent: "#F47920" },
  shiprocket: { text: "shiprocket", color: "#7B3FE4" },
  delhivery: { text: "DELHIVERY", color: "#E1251B" },
  bluedart: { text: "Blue Dart", color: "#233B8E" },
  cod: { text: "COD", color: "#15803D" },
};

/**
 * A logo tile: a real brand mark (white tile, the brand's colour), a
 * wordmark, or — for Oyklane's own features — a line icon on the brand
 * gradient. `size` is the tile's width in px.
 *   <Logo brand="razorpay" />  <Logo word="payu" />  <Logo icon="bolt" />
 */
export function Logo({ brand, word, icon, size = 44, title, className = "" }) {
  const style = { "--s": `${size}px` };
  if (brand && BRANDS[brand]) {
    const b = BRANDS[brand];
    return (
      <span className={`brand-tile ${className}`} style={style} title={title || b.title}>
        <svg viewBox="0 0 24 24" role="img" aria-label={title || b.title} fill={b.hex}>
          <path d={b.path} />
        </svg>
      </span>
    );
  }
  if (word && WORDMARKS[word]) {
    const w = WORDMARKS[word];
    // Fit the word inside the tile: capitals are wider than lower case.
    const perChar = w.text === w.text.toUpperCase() ? 0.7 : 0.6;
    const fontSize = Math.min(size * 0.3, (size * 0.78) / (w.text.length * perChar));
    return (
      <span className={`brand-tile brand-tile--word ${className}`} style={style} title={title || w.text} role="img" aria-label={title || w.text}>
        <span style={{ color: w.color, fontSize: `calc(var(--s) * ${(fontSize / size).toFixed(3)})` }}>
          {w.accent ? (
            <>
              {w.text.slice(0, -1)}
              <em style={{ color: w.accent }}>{w.text.slice(-1)}</em>
            </>
          ) : (
            w.text
          )}
        </span>
      </span>
    );
  }
  return (
    <span className={`brand-tile brand-tile--feature ${className}`} style={style} title={title} aria-hidden={title ? undefined : "true"}>
      <Icon d={I[icon] || I.spark} />
    </span>
  );
}

/** Just the mark, inline at text size (payment rows, chips). */
export function Mark({ brand, word, size = 16 }) {
  if (brand && BRANDS[brand]) {
    const b = BRANDS[brand];
    return (
      <svg className="mark" width={size} height={size} viewBox="0 0 24 24" fill={b.hex} role="img" aria-label={b.title}>
        <path d={b.path} />
      </svg>
    );
  }
  const w = WORDMARKS[word];
  if (!w) return null;
  return (
    <b className="mark mark--word" style={{ color: w.color }}>
      {w.text}
    </b>
  );
}
