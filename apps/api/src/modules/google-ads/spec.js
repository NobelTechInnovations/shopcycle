const { HttpError } = require("@shopcycle/utils");
const { micros } = require("./client");

/**
 * The Google Ads wizard's campaign spec and how it becomes one atomic
 * googleAds:mutate (temporary ids link the budget, campaign, criteria, ad
 * groups / asset groups, assets and ads — Google creates all of it or
 * none of it, so a failed publish never leaves half a campaign behind).
 *
 *   { campaign: { name, type, budget, bidding, targetCpa, targetRoas, maxCpc,
 *                 startDate, endDate, locations: [{id,name}], excludedLocations,
 *                 languages: [{id,name}], searchPartners, negativeKeywords: [{text,matchType}],
 *                 merchantId, urlExpansion },
 *     adGroups: [{ key, name, cpc, keywords: [{text,matchType}],
 *                  ads: [{ key, finalUrl, headlines, descriptions, path1, path2,          // Search
 *                          longHeadline, businessName, images: {landscape,square,logo} }] }], // Display
 *     assetGroups: [{ key, name, finalUrl, headlines, longHeadlines, descriptions, businessName,
 *                     images: { landscape, square, portrait, logo }, allProducts }] }      // Performance Max
 */

const TYPES = {
  SEARCH: {
    label: "Search",
    hint: "Text ads when people search Google for what you sell. You choose the keywords.",
    bidding: ["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE", "MAXIMIZE_CLICKS", "MANUAL_CPC"],
    recommended: "MAXIMIZE_CONVERSIONS",
  },
  PERFORMANCE_MAX: {
    label: "Performance Max",
    hint: "One campaign across Search, Shopping, YouTube, Display, Gmail and Maps. Google builds ads from your text, images and (with Merchant Center) products.",
    bidding: ["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"],
    recommended: "MAXIMIZE_CONVERSION_VALUE",
  },
  SHOPPING: {
    label: "Shopping",
    hint: "Product listings with photo and price at the top of Google. Needs Merchant Center linked.",
    bidding: ["MAXIMIZE_CLICKS", "MANUAL_CPC", "TARGET_ROAS"],
    recommended: "MAXIMIZE_CLICKS",
    needsMerchant: true,
  },
  DISPLAY: {
    label: "Display",
    hint: "Image ads on millions of websites and apps. Good for reminding past visitors; cheap reach.",
    bidding: ["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CLICKS", "MANUAL_CPC"],
    recommended: "MAXIMIZE_CLICKS",
  },
};

const BIDDING = {
  MAXIMIZE_CONVERSIONS: { label: "Most purchases", hint: "Google gets the most purchases for your budget. Optional: a target cost per purchase.", needsConversions: true },
  MAXIMIZE_CONVERSION_VALUE: { label: "Most sales value", hint: "Google aims for the most order value. Optional: a target return on ad spend.", needsConversions: true },
  MAXIMIZE_CLICKS: { label: "Most clicks", hint: "The most visits to your store for the budget. Good when you don't track purchases yet." },
  MANUAL_CPC: { label: "Manual cost per click", hint: "You set the most you'll pay per click. Only if you know your numbers." },
  TARGET_ROAS: { label: "Target return on ad spend", hint: "Shopping: Google bids for at least this much sales value per ₹1 spent.", needsConversions: true },
};

const MATCH_TYPES = { BROAD: "Broad", PHRASE: "Phrase", EXACT: "Exact" };
const URL_SUFFIX = "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}";
const MIN_DAILY = 100;

const txt = (v) => String(v ?? "").trim();
const https = (u) => /^https:\/\/[^\s]+\.[^\s]+/i.test(txt(u));
const len = (arr) => (Array.isArray(arr) ? arr.map(txt).filter(Boolean) : []);

/** Errors (block publishing) and warnings, in words. */
function check(spec, caps = {}) {
  const errors = [];
  const warnings = [];
  const c = spec?.campaign || {};
  const type = TYPES[c.type];
  if (!txt(c.name)) errors.push({ at: "campaign", text: "Give the campaign a name." });
  if (!type) errors.push({ at: "campaign", text: "Choose a campaign type." });
  if (!(Number(c.budget) > 0)) errors.push({ at: "campaign", text: "Set a daily budget." });
  else if (Number(c.budget) < MIN_DAILY) warnings.push({ at: "campaign", text: `Under ₹${MIN_DAILY} a day, campaigns get very few clicks.` });
  if (type && !type.bidding.includes(c.bidding)) errors.push({ at: "campaign", text: `${BIDDING[c.bidding]?.label || "That bidding"} isn't available for ${type.label} campaigns.` });
  if (BIDDING[c.bidding]?.needsConversions && caps.conversions === false) warnings.push({ at: "campaign", text: "No purchase tracking yet — Google can't optimise for purchases. Set it up in the Account check tab (one click), or use Most clicks for now." });
  if (c.bidding === "TARGET_ROAS" && !(Number(c.targetRoas) > 0)) errors.push({ at: "campaign", text: "Enter the target return on ad spend, e.g. 4 for ₹4 back per ₹1." });
  if (c.bidding === "MANUAL_CPC" && c.type !== "PERFORMANCE_MAX" && !(spec.adGroups || []).every((g) => Number(g.cpc) > 0)) errors.push({ at: "adgroups", text: "Manual bidding needs a maximum cost per click on each ad group." });
  if (c.type === "SHOPPING" && c.bidding === "MANUAL_CPC" && !(spec.adGroups || []).every((g) => Number(g.cpc) > 0)) errors.push({ at: "adgroups", text: "Set a maximum cost per click." });
  if (!(c.locations || []).length) errors.push({ at: "campaign", text: "Choose where to show the ads (a country, state or city)." });
  if (!(c.languages || []).length) warnings.push({ at: "campaign", text: "No language chosen — ads show to speakers of any language." });
  if (c.startDate && c.endDate && c.endDate < c.startDate) errors.push({ at: "campaign", text: "The end date is before the start date." });
  if (type?.needsMerchant && !c.merchantId) errors.push({ at: "campaign", text: "Shopping campaigns need your Merchant Center. Set it up in Apps ▸ Google & YouTube, and link it to Google Ads." });
  if (c.type === "PERFORMANCE_MAX" && (c.negativeKeywords || []).length) warnings.push({ at: "campaign", text: "Performance Max doesn't take negative keywords here — they'll be left out." });

  if (["SEARCH", "DISPLAY", "SHOPPING"].includes(c.type)) {
    const groups = spec.adGroups || [];
    if (!groups.length) errors.push({ at: "adgroups", text: "Add at least one ad group." });
    groups.forEach((g, i) => {
      const at = `adgroup:${g.key || i}`;
      const name = g.name || `Ad group ${i + 1}`;
      if (!txt(g.name)) errors.push({ at, text: `Ad group ${i + 1}: give it a name.` });
      if (c.type === "SEARCH") {
        const kws = (g.keywords || []).filter((k) => txt(k.text));
        if (!kws.length) errors.push({ at, text: `${name}: add keywords — the searches your ads should show for.` });
        else if (kws.length < 5) warnings.push({ at, text: `${name}: 5–20 closely related keywords usually work best.` });
        kws.forEach((k) => {
          if (txt(k.text).length > 80) errors.push({ at, text: `${name}: keyword "${txt(k.text).slice(0, 20)}…" is over 80 characters.` });
          if (txt(k.text).split(/\s+/).length > 10) errors.push({ at, text: `${name}: keywords can have 10 words at most.` });
        });
      }
      if (c.type !== "SHOPPING") {
        const ads = g.ads || [];
        if (!ads.length) errors.push({ at, text: `${name}: add an ad.` });
        ads.forEach((a, j) => {
          const aat = `ad:${a.key || `${i}-${j}`}`;
          const an = `${name} › ad ${j + 1}`;
          if (!https(a.finalUrl)) errors.push({ at: aat, text: `${an}: the link must be a full https:// address on your store.` });
          const hl = len(a.headlines);
          const ds = len(a.descriptions);
          if (c.type === "SEARCH") {
            if (hl.length < 3) errors.push({ at: aat, text: `${an}: at least 3 headlines (8–15 give Google room to test).` });
            if (hl.length > 15) errors.push({ at: aat, text: `${an}: 15 headlines at most.` });
            if (ds.length < 2) errors.push({ at: aat, text: `${an}: at least 2 descriptions.` });
            if (ds.length > 4) errors.push({ at: aat, text: `${an}: 4 descriptions at most.` });
            if (new Set(hl.map((h) => h.toLowerCase())).size !== hl.length) errors.push({ at: aat, text: `${an}: headlines must all be different.` });
            if (hl.length >= 3 && hl.length < 8) warnings.push({ at: aat, text: `${an}: 8 or more headlines improve the ad's strength.` });
            if (txt(a.path1).length > 15 || txt(a.path2).length > 15) errors.push({ at: aat, text: `${an}: display path parts are 15 characters at most.` });
          } else {
            if (!hl.length) errors.push({ at: aat, text: `${an}: add at least one headline.` });
            if (hl.length > 5) errors.push({ at: aat, text: `${an}: 5 headlines at most.` });
            if (!txt(a.longHeadline)) errors.push({ at: aat, text: `${an}: add a long headline.` });
            if (txt(a.longHeadline).length > 90) errors.push({ at: aat, text: `${an}: the long headline is 90 characters at most.` });
            if (!ds.length) errors.push({ at: aat, text: `${an}: add a description.` });
            if (!txt(a.businessName)) errors.push({ at: aat, text: `${an}: add your business name.` });
            if (txt(a.businessName).length > 25) errors.push({ at: aat, text: `${an}: the business name is 25 characters at most.` });
            if (!(a.images?.landscape || []).length) errors.push({ at: aat, text: `${an}: add a landscape image (1.91:1).` });
            if (!(a.images?.square || []).length) errors.push({ at: aat, text: `${an}: add a square image (1:1).` });
          }
          hl.forEach((h) => h.length > 30 && errors.push({ at: aat, text: `${an}: headline "${h.slice(0, 20)}…" is over 30 characters.` }));
          ds.forEach((d) => d.length > 90 && errors.push({ at: aat, text: `${an}: a description is over 90 characters.` }));
        });
      }
    });
  }

  if (c.type === "PERFORMANCE_MAX") {
    const groups = spec.assetGroups || [];
    if (!groups.length) errors.push({ at: "assetgroups", text: "Add an asset group." });
    groups.forEach((g, i) => {
      const at = `assetgroup:${g.key || i}`;
      const n = g.name || `Asset group ${i + 1}`;
      const hl = len(g.headlines);
      const lh = len(g.longHeadlines);
      const ds = len(g.descriptions);
      if (!txt(g.name)) errors.push({ at, text: `Asset group ${i + 1}: give it a name.` });
      if (!https(g.finalUrl)) errors.push({ at, text: `${n}: the link must be a full https:// address on your store.` });
      if (hl.length < 3 || hl.length > 15) errors.push({ at, text: `${n}: 3 to 15 headlines (30 characters each).` });
      if (lh.length < 1 || lh.length > 5) errors.push({ at, text: `${n}: 1 to 5 long headlines (90 characters each).` });
      if (ds.length < 2 || ds.length > 5) errors.push({ at, text: `${n}: 2 to 5 descriptions (90 characters each).` });
      if (ds.length && !ds.some((d) => d.length <= 60)) errors.push({ at, text: `${n}: at least one description must be 60 characters or fewer.` });
      if (!txt(g.businessName) || txt(g.businessName).length > 25) errors.push({ at, text: `${n}: business name (25 characters at most).` });
      hl.forEach((h) => h.length > 30 && errors.push({ at, text: `${n}: headline "${h.slice(0, 20)}…" is over 30 characters.` }));
      lh.forEach((h) => h.length > 90 && errors.push({ at, text: `${n}: a long headline is over 90 characters.` }));
      ds.forEach((d) => d.length > 90 && errors.push({ at, text: `${n}: a description is over 90 characters.` }));
      if (!(g.images?.landscape || []).length) errors.push({ at, text: `${n}: add a landscape image (1.91:1, at least 600×314).` });
      if (!(g.images?.square || []).length) errors.push({ at, text: `${n}: add a square image (1:1, at least 300×300).` });
      if (!(g.images?.logo || []).length) errors.push({ at, text: `${n}: add your square logo (1:1, at least 128×128).` });
      if (hl.length >= 3 && hl.length < 5) warnings.push({ at, text: `${n}: 5+ headlines and 4+ images give Google more to work with ("ad strength").` });
    });
    if (!c.merchantId) warnings.push({ at: "campaign", text: "Without Merchant Center, Performance Max can't show your products with photos and prices." });
  }
  return { errors, warnings, ok: errors.length === 0 };
}

/** The atomic operations, and which spec item each one is for (to point
 * Google's errors at the right step). `legacyDates` uses start_date/end_date
 * for API versions before start_date_time. */
function operations(spec, customerId, { legacyDates = false } = {}) {
  const c = spec.campaign;
  const rn = (kind, id) => `customers/${customerId}/${kind}/${id}`;
  let next = -1;
  const tmp = () => next--;
  const ops = [];
  const where = [];
  const push = (op, at) => {
    ops.push(op);
    where.push(at);
  };

  const budgetRN = rn("campaignBudgets", tmp());
  push({ campaignBudgetOperation: { create: { resourceName: budgetRN, name: `${txt(c.name)} — budget ${Date.now()}`, amountMicros: micros(c.budget), deliveryMethod: "STANDARD", explicitlyShared: false } } }, "campaign");

  const campaignRN = rn("campaigns", tmp());
  const campaign = {
    resourceName: campaignRN,
    name: txt(c.name),
    status: "PAUSED",
    advertisingChannelType: c.type,
    campaignBudget: budgetRN,
    finalUrlSuffix: URL_SUFFIX,
    containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
  };
  if (c.bidding === "MAXIMIZE_CONVERSIONS") campaign.maximizeConversions = Number(c.targetCpa) > 0 ? { targetCpaMicros: micros(c.targetCpa) } : {};
  if (c.bidding === "MAXIMIZE_CONVERSION_VALUE") campaign.maximizeConversionValue = Number(c.targetRoas) > 0 ? { targetRoas: Number(c.targetRoas) } : {};
  if (c.bidding === "MAXIMIZE_CLICKS") campaign.targetSpend = Number(c.maxCpc) > 0 ? { cpcBidCeilingMicros: micros(c.maxCpc) } : {};
  if (c.bidding === "MANUAL_CPC") campaign.manualCpc = { enhancedCpcEnabled: false };
  if (c.bidding === "TARGET_ROAS") campaign.targetRoas = { targetRoas: Number(c.targetRoas) };
  if (c.type === "SEARCH") campaign.networkSettings = { targetGoogleSearch: true, targetSearchNetwork: Boolean(c.searchPartners), targetContentNetwork: false, targetPartnerSearchNetwork: false };
  if (c.type === "SHOPPING") campaign.shoppingSetting = { merchantId: String(c.merchantId), campaignPriority: 0, enableLocal: false };
  if (c.type === "PERFORMANCE_MAX") {
    if (c.merchantId) campaign.shoppingSetting = { merchantId: String(c.merchantId) };
    campaign.urlExpansionOptOut = c.urlExpansion === false;
    campaign.brandGuidelinesEnabled = false;
  }
  if (c.startDate) campaign[legacyDates ? "startDate" : "startDateTime"] = legacyDates ? c.startDate : `${c.startDate} 00:00:00`;
  if (c.endDate) campaign[legacyDates ? "endDate" : "endDateTime"] = legacyDates ? c.endDate : `${c.endDate} 23:59:59`;
  push({ campaignOperation: { create: campaign } }, "campaign");

  for (const l of c.locations || []) push({ campaignCriterionOperation: { create: { campaign: campaignRN, location: { geoTargetConstant: `geoTargetConstants/${l.id}` } } } }, "campaign");
  for (const l of c.excludedLocations || []) push({ campaignCriterionOperation: { create: { campaign: campaignRN, negative: true, location: { geoTargetConstant: `geoTargetConstants/${l.id}` } } } }, "campaign");
  for (const l of c.languages || []) push({ campaignCriterionOperation: { create: { campaign: campaignRN, language: { languageConstant: `languageConstants/${l.id}` } } } }, "campaign");
  if (c.type !== "PERFORMANCE_MAX") {
    for (const k of (c.negativeKeywords || []).filter((x) => txt(x.text))) push({ campaignCriterionOperation: { create: { campaign: campaignRN, negative: true, keyword: { text: txt(k.text), matchType: MATCH_TYPES[k.matchType] ? k.matchType : "PHRASE" } } } }, "campaign");
  }

  if (["SEARCH", "DISPLAY", "SHOPPING"].includes(c.type)) {
    for (const [i, g] of (spec.adGroups || []).entries()) {
      const at = `adgroup:${g.key || i}`;
      const groupRN = rn("adGroups", tmp());
      const group = { resourceName: groupRN, name: txt(g.name), campaign: campaignRN, status: "ENABLED", type: c.type === "SEARCH" ? "SEARCH_STANDARD" : c.type === "DISPLAY" ? "DISPLAY_STANDARD" : "SHOPPING_PRODUCT_ADS" };
      if (Number(g.cpc) > 0) group.cpcBidMicros = micros(g.cpc);
      push({ adGroupOperation: { create: group } }, at);
      if (c.type === "SEARCH") {
        for (const k of (g.keywords || []).filter((x) => txt(x.text))) push({ adGroupCriterionOperation: { create: { adGroup: groupRN, status: "ENABLED", keyword: { text: txt(k.text), matchType: MATCH_TYPES[k.matchType] ? k.matchType : "PHRASE" } } } }, at);
        for (const [j, a] of (g.ads || []).entries()) {
          push(
            {
              adGroupAdOperation: {
                create: {
                  adGroup: groupRN,
                  status: "ENABLED",
                  ad: { finalUrls: [txt(a.finalUrl)], responsiveSearchAd: { headlines: len(a.headlines).map((text) => ({ text })), descriptions: len(a.descriptions).map((text) => ({ text })), ...(txt(a.path1) ? { path1: txt(a.path1) } : {}), ...(txt(a.path2) ? { path2: txt(a.path2) } : {}) } },
                },
              },
            },
            `ad:${a.key || `${i}-${j}`}`
          );
        }
      }
      if (c.type === "DISPLAY") {
        for (const [j, a] of (g.ads || []).entries()) {
          const img = (list) => (list || []).map((asset) => ({ asset }));
          push(
            {
              adGroupAdOperation: {
                create: {
                  adGroup: groupRN,
                  status: "ENABLED",
                  ad: {
                    finalUrls: [txt(a.finalUrl)],
                    responsiveDisplayAd: {
                      marketingImages: img(a.images?.landscape),
                      squareMarketingImages: img(a.images?.square),
                      ...((a.images?.logo || []).length ? { squareLogoImages: img(a.images.logo) } : {}),
                      headlines: len(a.headlines).map((text) => ({ text })),
                      longHeadline: { text: txt(a.longHeadline) },
                      descriptions: len(a.descriptions).map((text) => ({ text })),
                      businessName: txt(a.businessName),
                    },
                  },
                },
              },
            },
            `ad:${a.key || `${i}-${j}`}`
          );
        }
      }
      if (c.type === "SHOPPING") {
        push({ adGroupAdOperation: { create: { adGroup: groupRN, status: "ENABLED", ad: { shoppingProductAd: {} } } } }, at);
        push({ adGroupCriterionOperation: { create: { adGroup: groupRN, status: "ENABLED", listingGroup: { type: "UNIT" }, ...(Number(g.cpc) > 0 ? { cpcBidMicros: micros(g.cpc) } : {}) } } }, at);
      }
    }
  }

  if (c.type === "PERFORMANCE_MAX") {
    for (const [i, g] of (spec.assetGroups || []).entries()) {
      const at = `assetgroup:${g.key || i}`;
      const texts = [];
      const text = (value, fieldType) => {
        const assetRN = rn("assets", tmp());
        push({ assetOperation: { create: { resourceName: assetRN, textAsset: { text: value } } } }, at);
        texts.push({ asset: assetRN, fieldType });
      };
      len(g.headlines).forEach((h) => text(h, "HEADLINE"));
      len(g.longHeadlines).forEach((h) => text(h, "LONG_HEADLINE"));
      len(g.descriptions).forEach((d) => text(d, "DESCRIPTION"));
      text(txt(g.businessName), "BUSINESS_NAME");
      const groupRN = rn("assetGroups", tmp());
      push({ assetGroupOperation: { create: { resourceName: groupRN, campaign: campaignRN, name: txt(g.name), finalUrls: [txt(g.finalUrl)], status: "ENABLED" } } }, at);
      for (const t of texts) push({ assetGroupAssetOperation: { create: { assetGroup: groupRN, asset: t.asset, fieldType: t.fieldType } } }, at);
      const images = [
        ...(g.images?.landscape || []).map((a) => [a, "MARKETING_IMAGE"]),
        ...(g.images?.square || []).map((a) => [a, "SQUARE_MARKETING_IMAGE"]),
        ...(g.images?.portrait || []).map((a) => [a, "PORTRAIT_MARKETING_IMAGE"]),
        ...(g.images?.logo || []).map((a) => [a, "LOGO"]),
      ];
      for (const [asset, fieldType] of images) push({ assetGroupAssetOperation: { create: { assetGroup: groupRN, asset, fieldType } } }, at);
      if (c.merchantId && g.allProducts !== false) push({ assetGroupListingGroupFilterOperation: { create: { assetGroup: groupRN, type: "UNIT_INCLUDED", listingSource: "SHOPPING" } } }, at);
    }
  }
  return { ops, where, campaignRN };
}

function assertPublishable(spec, caps) {
  const r = check(spec, caps);
  if (!r.ok) throw new HttpError(400, r.errors[0].text, { errors: r.errors, warnings: r.warnings });
  return r;
}

module.exports = { TYPES, BIDDING, MATCH_TYPES, URL_SUFFIX, MIN_DAILY, check, operations, assertPublishable };
