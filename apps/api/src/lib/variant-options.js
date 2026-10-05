/**
 * Variants are named by their options, "Red / M" style. These say which
 * part is a size and which a colour — for the storefront's size and colour
 * filters and pickers, and the admin's product filters.
 */
const SIZE_VALUE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl|free ?size|one ?size|\d{1,3}(\.\d)?|\d{2}\s?-\s?\d{2}|(uk|us|eu)\s?\d{1,2}(\.\d)?|\d+(\.\d+)?\s?(ml|l|g|gm|kg|cm|mm|in|inch|ct|carat)s?|\d{1,2}\s?(y|yrs?|years?|m|months?)(\s?-\s?\d{1,2}\s?(y|yrs?|years?|m|months?))?)$/i;
const COLOUR_WORDS =
  /\b(black|white|ivory|cream|off[- ]?white|beige|tan|camel|brown|chocolate|coffee|grey|gray|charcoal|silver|gold|rose ?gold|red|maroon|wine|burgundy|pink|blush|peach|coral|orange|rust|mustard|yellow|lime|olive|green|mint|sage|teal|turquoise|aqua|blue|navy|indigo|denim|sky|purple|lavender|lilac|violet|magenta|multi|multicolou?r|khaki|nude|stone|sand|emerald|ruby|sapphire)\b/i;

/** The size and colour values in a store's variant names. */
function sizesAndColours(titles) {
  const sizes = new Set();
  const colours = new Set();
  for (const title of titles) {
    for (const part of String(title || "").split(" / ").map((x) => x.trim()).filter(Boolean)) {
      if (/^default( title)?$/i.test(part)) continue;
      if (SIZE_VALUE.test(part)) sizes.add(part);
      else if (COLOUR_WORDS.test(part)) colours.add(part);
    }
  }
  return { sizes: [...sizes], colours: [...colours] };
}

/** A Prisma condition: a variant whose name has `value` as one of its parts. */
function variantHasPart(value) {
  const v = String(value);
  return {
    OR: [
      { title: { equals: v, mode: "insensitive" } },
      { title: { startsWith: `${v} / `, mode: "insensitive" } },
      { title: { endsWith: ` / ${v}`, mode: "insensitive" } },
      { title: { contains: ` / ${v} / `, mode: "insensitive" } },
    ],
  };
}

module.exports = { SIZE_VALUE, COLOUR_WORDS, sizesAndColours, variantHasPart };
