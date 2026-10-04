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

function lookup(name) {
  const [kind, num] = String(name || "").split("-");
  const n = Number(num) || 1;
  if (kind === "product") return { viewBox: "0 0 800 1000", body: PRODUCTS[((n - 1) % 6) + 1] };
  if (kind === "collection") return { viewBox: "0 0 800 800", body: COLLECTIONS[((n - 1) % 4) + 1] };
  if (kind === "lifestyle") return { viewBox: "0 0 1600 900", body: LIFESTYLE[((n - 1) % 2) + 1] };
  if (kind === "jewel") return { viewBox: "0 0 800 800", body: JEWELS[((n - 1) % 4) + 1] };
  return { viewBox: "0 0 800 800", body: IMAGE };
}

function placeholderSvg(name, className = "") {
  const { viewBox, body } = lookup(name);
  const cls = String(className || "").replace(/[^\w\s-]/g, "");
  return `<svg class="placeholder-svg${cls ? ` ${cls}` : ""}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;
}

module.exports = { placeholderSvg };
