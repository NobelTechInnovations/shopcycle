/**
 * Illustrations for empty theme slots — the `placeholder_svg` Liquid
 * filter, like Shopify's placeholder_svg_tag. A home page section with no
 * products, collections or images yet shows these instead of an empty box:
 *
 *   {{ 'product-3' | placeholder_svg }}
 *   {{ 'lifestyle-1' | placeholder_svg: 'hero__art' }}
 *
 * Drawn in currentColor at low opacity, so they pick up the theme's text
 * colour; the element around them provides the background.
 *   product-1…6    4:5   serum bottle, tote bag, sneaker, jar, mug, t-shirt
 *   collection-1…4 1:1   small arrangements of products
 *   lifestyle-1…2  16:9  wide scenes for banners and heroes
 *   jewel-1…4      1:1   ring, pendant necklace, drop earrings, bangles
 *   image          1:1   a generic picture frame
 */

const LINE = 'fill="currentColor" fill-opacity=".09" stroke="currentColor" stroke-opacity=".42" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';
const DETAIL = 'fill="currentColor" fill-opacity=".16" stroke="none"';
const STROKE = 'fill="none" stroke="currentColor" stroke-opacity=".42" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';
const SHADOW = '<ellipse cx="400" cy="835" rx="210" ry="22" fill="currentColor" fill-opacity=".07"/>';

const PRODUCTS = {
  // Serum bottle with dropper
  1: `${SHADOW}<g ${LINE}><ellipse cx="400" cy="262" rx="40" ry="56"/><rect x="348" y="304" width="104" height="78" rx="14"/><rect x="360" y="378" width="80" height="58" rx="8"/><rect x="298" y="430" width="204" height="392" rx="44"/></g><rect x="332" y="548" width="136" height="150" rx="10" ${DETAIL}/><path d="M362 598h76M372 628h56" ${STROKE}/>`,
  // Tote bag
  2: `${SHADOW}<path d="M318 430c0-126 164-126 164 0" ${STROKE} stroke-width="12"/><g ${LINE}><path d="M252 420h296l36 398H216z"/></g><circle cx="400" cy="610" r="48" ${DETAIL}/><path d="M378 610h44" ${STROKE}/>`,
  // Sneaker
  3: `<g transform="translate(0 -60)">${SHADOW}<g ${LINE}><path d="M205 690l16-150c3-26 22-42 48-42h66c24 0 40 10 56 30l62 70c24 28 58 40 102 44l64 6c50 5 78 22 82 42H205z"/><path d="M186 690h494c14 0 22 8 22 20v26c0 12-10 22-22 22H200c-14 0-24-10-24-24v-22c0-12 4-22 10-22z"/></g><path d="M300 560l30 18M322 540l30 18M346 522l28 18" ${STROKE}/><path d="M200 720h500" ${STROKE} stroke-opacity=".25"/></g>`,
  // Jar with lid and label
  4: `${SHADOW}<g ${LINE}><rect x="286" y="372" width="228" height="74" rx="16"/><rect x="270" y="440" width="260" height="382" rx="52"/></g><rect x="270" y="560" width="260" height="138" ${DETAIL}/><circle cx="400" cy="629" r="30" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="5"/><path d="M400 612c10 10 10 24 0 34-10-10-10-24 0-34z" fill="currentColor" fill-opacity=".35"/>`,
  // Mug with steam
  5: `<ellipse cx="386" cy="818" rx="200" ry="28" fill="currentColor" fill-opacity=".07"/><path d="M500 548c96 0 96 170 0 170" ${STROKE} stroke-width="22" stroke-opacity=".3"/><g ${LINE}><path d="M252 470h268v268c0 40-32 72-72 72H324c-40 0-72-32-72-72z"/></g><path d="M252 540h268" ${STROKE} stroke-opacity=".25"/><path d="M332 432c-18-22 18-40 0-66M388 432c-18-22 18-40 0-66M444 432c-18-22 18-40 0-66" ${STROKE} stroke-opacity=".3"/>`,
  // T-shirt
  6: `${SHADOW}<g ${LINE}><path d="M304 360l62-30c10 34 58 34 68 0l62 30 100 84-50 74-48-28v332H302V490l-48 28-50-74z"/></g><path d="M366 330c14 42 54 42 68 0" ${STROKE}/><rect x="356" y="560" width="88" height="66" rx="8" ${DETAIL}/>`,
};

const COLLECTIONS = {
  1: `<g transform="translate(40 60) scale(.62)">${PRODUCTS[1]}</g><g transform="translate(230 110) scale(.62)">${PRODUCTS[4]}</g>`,
  2: `<g transform="translate(20 70) scale(.62)">${PRODUCTS[2]}</g><g transform="translate(250 130) scale(.56)">${PRODUCTS[6]}</g>`,
  3: `<g transform="translate(60 90) scale(.6)">${PRODUCTS[5]}</g><g transform="translate(250 60) scale(.62)">${PRODUCTS[1]}</g>`,
  4: `<g transform="translate(40 120) scale(.66)">${PRODUCTS[3]}</g><g transform="translate(300 70) scale(.5)">${PRODUCTS[4]}</g>`,
};

const LIFESTYLE = {
  // Shelf with a vase, jar and framed print
  1: `<rect x="0" y="0" width="1600" height="900" fill="currentColor" fill-opacity=".03"/><rect x="980" y="150" width="300" height="360" rx="10" ${LINE.replace('fill-opacity=".09"', 'fill-opacity=".05"')}/><path d="M1020 460l80-110 60 70 40-40 50 80z" ${DETAIL}/><circle cx="1210" cy="230" r="26" ${DETAIL}/><path d="M820 600h700" ${STROKE} stroke-width="10" stroke-opacity=".3"/><g ${LINE}><path d="M880 600c-40-60-40-140 0-190h60c40 50 40 130 0 190z"/><rect x="1350" y="470" width="120" height="130" rx="20"/></g><path d="M910 410c-10-60 10-110 50-150M910 410c20-50 60-80 110-90M910 410c-30-40-70-60-120-60" ${STROKE} stroke-opacity=".35"/><path d="M0 760c300-50 560 40 900 0s520-40 700-10v150H0z" fill="currentColor" fill-opacity=".05"/>`,
  // Hills and sun
  2: `<rect x="0" y="0" width="1600" height="900" fill="currentColor" fill-opacity=".03"/><circle cx="1180" cy="300" r="110" fill="currentColor" fill-opacity=".12"/><path d="M0 640c220-150 420-190 640-90s420 60 620-60 300-90 340-60v470H0z" fill="currentColor" fill-opacity=".08"/><path d="M0 740c260-90 520-100 800-40s540 30 800-40v280H0z" fill="currentColor" fill-opacity=".1"/><path d="M0 640c220-150 420-190 640-90s420 60 620-60 300-90 340-60" ${STROKE} stroke-opacity=".3"/>`,
};


// Jewellery, for themes like Lumière (800 x 800).
const JEWELS = {
  // Solitaire ring
  1: `<ellipse cx="400" cy="690" rx="170" ry="18" fill="currentColor" fill-opacity=".07"/><ellipse cx="400" cy="480" rx="170" ry="170" ${STROKE} stroke-width="26" stroke-opacity=".32"/><ellipse cx="400" cy="480" rx="170" ry="170" fill="none" stroke="currentColor" stroke-opacity=".5" stroke-width="4"/><g ${LINE}><path d="M340 316l60-76 60 76-60 50z"/></g><path d="M340 316h120M372 316l28-76 28 76M400 366V316" ${STROKE} stroke-width="3"/><path d="M364 300l-30-12M436 300l30-12M400 230v-32" ${STROKE} stroke-width="3" stroke-opacity=".3"/>`,
  // Pendant on a chain
  2: `<path d="M200 150c20 250 110 380 200 420 90-40 180-170 200-420" fill="none" stroke="currentColor" stroke-opacity=".38" stroke-width="5" stroke-dasharray="2 10" stroke-linecap="round"/><circle cx="400" cy="578" r="12" ${LINE}/><g ${LINE}><path d="M400 600c-54 0-86 44-86 90 0 50 40 86 86 86s86-36 86-86c0-46-32-90-86-90z"/></g><circle cx="400" cy="688" r="30" ${DETAIL}/><path d="M384 676l16-14 16 14-16 30z" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="3" stroke-linejoin="round"/>`,
  // Drop earrings
  3: `${[270, 530].map((x) => `<circle cx="${x}" cy="210" r="16" ${LINE}/><path d="M${x} 226v70" ${STROKE}/><g ${LINE}><path d="M${x} 296c-46 60-70 120-70 170 0 50 32 86 70 86s70-36 70-86c0-50-24-110-70-170z"/></g><path d="M${x} 360c-22 34-34 72-34 104" ${STROKE} stroke-opacity=".25"/><circle cx="${x}" cy="480" r="22" ${DETAIL}/>`).join("")}<ellipse cx="400" cy="640" rx="230" ry="16" fill="currentColor" fill-opacity=".06"/>`,
  // Stacked bangles
  4: `<ellipse cx="400" cy="660" rx="220" ry="20" fill="currentColor" fill-opacity=".07"/>${[0, 1, 2].map((i) => `<ellipse cx="${400 + (i - 1) * 40}" cy="${440 - i * 30}" rx="190" ry="190" fill="none" stroke="currentColor" stroke-opacity="${0.42 - i * 0.08}" stroke-width="${i === 1 ? 22 : 10}"/>`).join("")}${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = (k / 8) * Math.PI * 2; return `<circle cx="${(400 + 190 * Math.cos(a)).toFixed(1)}" cy="${(410 + 190 * Math.sin(a)).toFixed(1)}" r="6" fill="currentColor" fill-opacity=".3"/>`; }).join("")}`,
};

const IMAGE = `<rect x="150" y="190" width="500" height="420" rx="28" ${LINE}/><circle cx="300" cy="330" r="42" ${DETAIL}/><path d="M170 560l150-140 110 100 90-70 110 110" ${STROKE}/>`;


// ── Colour art sets ─────────────────────────────────────────────────
// A theme can pick a set with the `placeholder_art` setting ("drink",
// "bag", "bottle"): product / collection / lifestyle placeholders become
// full-colour illustrations of that kind of product on soft backgrounds,
// so a demo store looks designed rather than empty.
const CAN_COLOURS = [
  { body: "#9FD8C3", band: "#2F8F6E", bg: "#EAF7F1", fruit: "#7BC86C" },
  { body: "#F7B9A5", band: "#D9534F", bg: "#FDEDE7", fruit: "#E8574A" },
  { body: "#F5D76E", band: "#D99A00", bg: "#FFF7DA", fruit: "#F2B705" },
  { body: "#C9A3DB", band: "#7B3F9E", bg: "#F5ECFA", fruit: "#8E44AD" },
  { body: "#9CC9F0", band: "#2F6DB5", bg: "#EAF3FC", fruit: "#3B82C4" },
  { body: "#BFE08A", band: "#4E8F1E", bg: "#F1F9E4", fruit: "#5FA82E" },
];
const BAG_COLOURS = [
  { body: "#C8946A", dark: "#7A4A2A", bg: "#F4F1EC" },
  { body: "#B5653A", dark: "#6B3519", bg: "#F3EEE8" },
  { body: "#6F7A55", dark: "#3E4630", bg: "#EEF0E8" },
  { body: "#2E3E63", dark: "#1B2540", bg: "#ECEFF5" },
  { body: "#D9A3A0", dark: "#8C5653", bg: "#F8EFEE" },
  { body: "#3A3A3A", dark: "#151515", bg: "#F1F1EF" },
];
const BOTTLE_COLOURS = [
  { body: "#B86B2A", cap: "#2B2B2B", label: "#F6EFE3", leaf: "#4F7A3A", bg: "#F3EEE4" },
  { body: "#7FA37A", cap: "#2F3B2C", label: "#FBF8F1", leaf: "#2F5D2A", bg: "#EEF3EA" },
  { body: "#E9E2D4", cap: "#B08D57", label: "#FFFFFF", leaf: "#8A6A3A", bg: "#F6F2EA" },
  { body: "#3D5A80", cap: "#E0B35A", label: "#F4F7FB", leaf: "#3D5A80", bg: "#EAF0F7" },
];

const canBody = (c) =>
  `<rect x="270" y="250" width="260" height="600" rx="42" fill="${c.body}"/><rect x="284" y="224" width="232" height="46" rx="18" fill="#D8DCE1"/><rect x="300" y="214" width="200" height="16" rx="8" fill="#C4C9D0"/><rect x="270" y="268" width="260" height="18" fill="#000" fill-opacity=".06"/><rect x="270" y="812" width="260" height="20" fill="#000" fill-opacity=".08"/><rect x="270" y="470" width="260" height="196" fill="${c.band}"/><circle cx="400" cy="568" r="60" fill="#fff" fill-opacity=".92"/><circle cx="400" cy="578" r="28" fill="${c.fruit}"/><path d="M400 550c10-16 26-22 40-20-6 16-22 24-40 20z" fill="#3E8E41"/><rect x="298" y="296" width="34" height="500" rx="17" fill="#fff" fill-opacity=".3"/><path d="M300 720h200M300 750h150" stroke="#fff" stroke-opacity=".55" stroke-width="10" stroke-linecap="round"/>`;
const bagBody = (c) =>
  `<path d="M318 432c0-150 164-150 164 0" fill="none" stroke="${c.dark}" stroke-width="24" stroke-linecap="round"/><path d="M216 420h368l40 408c2 14-8 24-22 24H198c-14 0-24-10-22-24z" fill="${c.body}"/><path d="M216 420h368l9 96H207z" fill="${c.dark}" fill-opacity=".22"/><rect x="370" y="498" width="60" height="44" rx="9" fill="#D8B56A"/><rect x="386" y="510" width="28" height="20" rx="5" fill="${c.body}"/><path d="M236 804h328" stroke="#fff" stroke-opacity=".28" stroke-width="5" stroke-dasharray="14 10"/><path d="M228 460l-8 300" stroke="#fff" stroke-opacity=".14" stroke-width="20" stroke-linecap="round"/>`;
const bottleBody = (c) =>
  `<rect x="300" y="300" width="200" height="560" rx="48" fill="${c.body}"/><rect x="330" y="214" width="140" height="100" rx="20" fill="${c.cap}"/><rect x="340" y="226" width="120" height="8" rx="4" fill="#fff" fill-opacity=".18"/><rect x="300" y="472" width="200" height="236" fill="${c.label}"/><path d="M400 640c34-30 34-68 0-90-34 22-34 60 0 90z" fill="${c.leaf}"/><path d="M400 640v-80" stroke="${c.label}" stroke-width="4"/><rect x="340" y="506" width="120" height="14" rx="7" fill="${c.leaf}" fill-opacity=".55"/><rect x="360" y="664" width="80" height="10" rx="5" fill="${c.leaf}" fill-opacity=".35"/><rect x="318" y="330" width="26" height="480" rx="13" fill="#fff" fill-opacity=".24"/>`;

const shadow = (cx, cy, rx) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="24" fill="#000" fill-opacity=".08"/>`;
const BODY = { drink: canBody, bag: bagBody, bottle: bottleBody };
const COLOURS = { drink: CAN_COLOURS, bag: BAG_COLOURS, bottle: BOTTLE_COLOURS };

/** Scenes for heroes and banners: two of the product on a soft colour field. */
function scene(set, n) {
  const cs = COLOURS[set];
  const a = cs[(n - 1) % cs.length];
  const b = cs[n % cs.length];
  const body = BODY[set];
  const field = set === "drink" ? ["#FBE4E1", "#F6CFCB"] : set === "bag" ? ["#EFEAE3", "#E3DACD"] : ["#EDF2E8", "#DCE7D4"];
  const leaves =
    set === "drink"
      ? `<circle cx="830" cy="700" r="70" fill="${a.fruit}" fill-opacity=".85"/><circle cx="830" cy="700" r="48" fill="#fff" fill-opacity=".45"/><circle cx="1480" cy="250" r="44" fill="${b.fruit}" fill-opacity=".8"/>`
      : set === "bottle"
        ? `<path d="M820 760c90-130 220-170 320-140-60 110-190 170-320 140z" fill="${a.leaf}" fill-opacity=".55"/><path d="M1460 300c-90 20-150 90-160 180 90-10 150-80 160-180z" fill="${b.leaf}" fill-opacity=".5"/>`
        : `<rect x="820" y="220" width="12" height="520" rx="6" fill="#000" fill-opacity=".05"/>`;
  return `<rect width="1600" height="900" fill="${field[0]}"/><circle cx="1000" cy="460" r="360" fill="${field[1]}"/><g transform="translate(-180 0)">${leaves}</g>${shadow(880, 840, 200)}${shadow(1130, 860, 200)}<g transform="translate(520 -10) scale(.96)">${body(a)}</g><g transform="translate(760 30) scale(.96)">${body(b)}</g>`;
}

function colourArt(set, kind, n) {
  const cs = COLOURS[set];
  if (!cs) return null;
  const c = cs[(n - 1) % cs.length];
  if (kind === "product") return { viewBox: "0 0 800 1000", body: `<rect width="800" height="1000" fill="${c.bg}"/>${shadow(400, 860, 190)}${BODY[set](c)}` };
  if (kind === "collection" || kind === "jewel") {
    const fill = set === "drink" ? c.body : c.bg;
    return { viewBox: "0 0 800 800", body: `<rect width="800" height="800" fill="${fill}"/><circle cx="400" cy="400" r="330" fill="#fff" fill-opacity="${set === "drink" ? ".25" : ".5"}"/><g transform="translate(24 -96) scale(.94)">${BODY[set](c)}</g>` };
  }
  if (kind === "lifestyle") return { viewBox: "0 0 1600 900", body: scene(set, n) };
  return null;
}

function lookup(name, set) {
  const [kind, num] = String(name || "").split("-");
  const n = Number(num) || 1;
  const coloured = set ? colourArt(set, kind, n) : null;
  if (coloured) return coloured;
  if (kind === "product") return { viewBox: "0 0 800 1000", body: PRODUCTS[((n - 1) % 6) + 1] };
  if (kind === "collection") return { viewBox: "0 0 800 800", body: COLLECTIONS[((n - 1) % 4) + 1] };
  if (kind === "lifestyle") return { viewBox: "0 0 1600 900", body: LIFESTYLE[((n - 1) % 2) + 1] };
  if (kind === "jewel") return { viewBox: "0 0 800 800", body: JEWELS[((n - 1) % 4) + 1] };
  return { viewBox: "0 0 800 800", body: IMAGE };
}

function placeholderSvg(name, className = "", set = null) {
  const { viewBox, body } = lookup(name, set);
  const cls = String(className || "").replace(/[^\w\s-]/g, "");
  return `<svg class="placeholder-svg${cls ? ` ${cls}` : ""}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;
}

module.exports = { placeholderSvg };
