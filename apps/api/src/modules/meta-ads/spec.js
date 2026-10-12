const { HttpError } = require("@shopcycle/utils");

/**
 * The Ads Manager's campaign spec (what the wizard saves in AdDraft.data)
 * and how it becomes Marketing API payloads. Everything a seller could
 * get wrong is checked here first, in plain words, so Meta's own (often
 * cryptic) rejections are the exception:
 *
 *   { campaign: { name, objective, buyingType, budgetLevel: "campaign"|"adset",
 *                 budgetType: "daily"|"lifetime", budget, bidStrategy, bidAmount, roasFloor,
 *                 specialAdCategories: [], startTime, endTime },
 *     adSets: [{ key, name, goal, budget, startTime, endTime, pixelId, conversionEvent,
 *                targeting: { countries, regions, cities, excludedRegions, ageMin, ageMax,
 *                             genders, locales, interests, customAudiences,
 *                             excludedAudiences, advantageAudience },
 *                placements: { mode: "automatic"|"manual", platforms, facebook, instagram, devices },
 *                bidAmount,
 *                ads: [{ key, name, format: "image"|"video"|"carousel", identity: { pageId, instagramId },
 *                        primaryText, headline, description, link, cta,
 *                        imageHash, videoId, thumbnailHash, cards: [{ imageHash, headline, description, link }] }] }] }
 */

/** Objectives, and the delivery goals each can optimise for. */
const OBJECTIVES = {
  OUTCOME_SALES: {
    label: "Sales",
    hint: "Find people likely to buy. Best with your Meta Pixel tracking purchases on your store.",
    goals: ["purchases", "add_to_cart", "landing_page_views", "link_clicks", "whatsapp"],
    recommended: "purchases",
  },
  OUTCOME_TRAFFIC: {
    label: "Traffic",
    hint: "Send people to your store. Cheapest clicks, but they may not buy.",
    goals: ["landing_page_views", "link_clicks", "reach"],
    recommended: "landing_page_views",
  },
  OUTCOME_ENGAGEMENT: {
    label: "Engagement",
    hint: "More WhatsApp chats, post likes, comments and video views.",
    goals: ["whatsapp", "post_engagement", "video_views"],
    recommended: "whatsapp",
  },
  OUTCOME_LEADS: {
    label: "Leads",
    hint: "Collect enquiries. Uses your website with the Pixel's Lead event, or WhatsApp chats.",
    goals: ["website_leads", "whatsapp"],
    recommended: "whatsapp",
  },
  OUTCOME_AWARENESS: {
    label: "Awareness",
    hint: "Show your brand to as many people as possible in your area.",
    goals: ["reach", "impressions"],
    recommended: "reach",
  },
  OUTCOME_APP_PROMOTION: {
    label: "App promotion",
    hint: "Get people to install your mobile app. Needs an app registered with Meta.",
    goals: [],
    unavailable: "Your store doesn't have a mobile app registered with Meta, so app promotion isn't available.",
  },
};

/** Each goal → the Marketing API's optimization_goal, billing event,
 * destination and what it needs. */
const GOALS = {
  purchases: { label: "Purchases", optimization: "OFFSITE_CONVERSIONS", billing: "IMPRESSIONS", destination: "WEBSITE", needsPixel: true, event: "PURCHASE" },
  add_to_cart: { label: "Add to cart", optimization: "OFFSITE_CONVERSIONS", billing: "IMPRESSIONS", destination: "WEBSITE", needsPixel: true, event: "ADD_TO_CART" },
  website_leads: { label: "Leads on your website", optimization: "OFFSITE_CONVERSIONS", billing: "IMPRESSIONS", destination: "WEBSITE", needsPixel: true, event: "LEAD" },
  landing_page_views: { label: "Store visits (landing page views)", optimization: "LANDING_PAGE_VIEWS", billing: "IMPRESSIONS", destination: "WEBSITE" },
  link_clicks: { label: "Link clicks", optimization: "LINK_CLICKS", billing: "IMPRESSIONS", destination: "WEBSITE" },
  whatsapp: { label: "WhatsApp chats", optimization: "CONVERSATIONS", billing: "IMPRESSIONS", destination: "WHATSAPP", needsPage: true, cta: "WHATSAPP_MESSAGE" },
  post_engagement: { label: "Post engagement", optimization: "POST_ENGAGEMENT", billing: "IMPRESSIONS", destination: "ON_POST" },
  video_views: { label: "Video views (ThruPlay)", optimization: "THRUPLAY", billing: "IMPRESSIONS", destination: "ON_VIDEO", needsVideo: true },
  reach: { label: "Reach (most people)", optimization: "REACH", billing: "IMPRESSIONS" },
  impressions: { label: "Impressions", optimization: "IMPRESSIONS", billing: "IMPRESSIONS" },
};

const BID_STRATEGIES = {
  LOWEST_COST_WITHOUT_CAP: { label: "Highest volume (recommended)", hint: "Meta gets the most results for your budget." },
  COST_CAP: { label: "Cost per result goal", hint: "Keeps the average cost per result near an amount you set. Can spend less if it can't." },
  LOWEST_COST_WITH_BID_CAP: { label: "Bid cap", hint: "Never bids above an amount in each auction. For experienced advertisers." },
  LOWEST_COST_WITH_MIN_ROAS: { label: "ROAS goal", hint: "Aims for at least this return on ad spend. Purchases goal only, needs purchase values." },
};

const CTAS = ["SHOP_NOW", "LEARN_MORE", "ORDER_NOW", "BUY_NOW", "SIGN_UP", "CONTACT_US", "GET_OFFER", "SUBSCRIBE", "WHATSAPP_MESSAGE", "SEE_MORE", "BOOK_NOW"];

const SPECIAL_CATEGORIES = {
  CREDIT: "Credit / loans",
  EMPLOYMENT: "Jobs",
  HOUSING: "Housing / property",
  ISSUES_ELECTIONS_POLITICS: "Social issues, elections or politics",
};

const PLACEMENTS = {
  platforms: ["facebook", "instagram", "audience_network", "messenger"],
  facebook: ["feed", "story", "facebook_reels", "marketplace", "video_feeds", "search", "right_hand_column"],
  instagram: ["stream", "story", "reels", "explore", "explore_home", "profile_feed"],
  devices: ["mobile", "desktop"],
};

const MIN_DAILY = 100; // ₹ — Meta's real floor varies by goal; below this most ad sets barely deliver.

const paise = (rupees) => Math.round(Number(rupees) * 100);
const iso = (d) => (d ? new Date(d).toISOString() : undefined);
const txt = (v, max) => String(v ?? "").trim().slice(0, max);

/** Every problem with a spec, in words — errors block publishing,
 * warnings are shown but don't. */
function check(spec, caps = {}) {
  const errors = [];
  const warnings = [];
  const c = spec?.campaign || {};
  const obj = OBJECTIVES[c.objective];
  if (!txt(c.name, 400)) errors.push({ at: "campaign", text: "Give the campaign a name." });
  if (!obj) errors.push({ at: "campaign", text: "Choose an objective." });
  else if (obj.unavailable) errors.push({ at: "campaign", text: obj.unavailable });
  const cbo = c.budgetLevel === "campaign";
  const lifetime = c.budgetType === "lifetime";
  if (cbo) {
    if (!(Number(c.budget) > 0)) errors.push({ at: "campaign", text: "Set the campaign budget." });
    else if (!lifetime && Number(c.budget) < MIN_DAILY) warnings.push({ at: "campaign", text: `A daily budget under ₹${MIN_DAILY} usually delivers very little.` });
    if (lifetime && !c.endTime) errors.push({ at: "campaign", text: "A lifetime budget needs an end date." });
  }
  if (["COST_CAP", "LOWEST_COST_WITH_BID_CAP"].includes(c.bidStrategy) && !(Number(c.bidAmount) > 0)) errors.push({ at: "campaign", text: "Enter the cost or bid amount for this bid strategy." });
  if (c.bidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && !(Number(c.roasFloor) > 0)) errors.push({ at: "campaign", text: "Enter the ROAS goal (for example 2 for ₹2 back per ₹1 spent)." });
  const special = (c.specialAdCategories || []).filter((x) => SPECIAL_CATEGORIES[x]);
  if (special.length) warnings.push({ at: "campaign", text: "Special ad category: Meta removes age, gender and postcode targeting and limits audiences for fairness." });

  const adSets = Array.isArray(spec?.adSets) ? spec.adSets : [];
  if (!adSets.length) errors.push({ at: "adsets", text: "Add at least one ad set." });
  if (adSets.length > 20) errors.push({ at: "adsets", text: "Up to 20 ad sets per campaign here." });
  adSets.forEach((s, i) => {
    const where = `adset:${s.key || i}`;
    const name = s.name || `Ad set ${i + 1}`;
    const goal = GOALS[s.goal];
    if (!goal || (obj && !obj.goals.includes(s.goal))) errors.push({ at: where, text: `${name}: choose a goal that fits the ${obj?.label || ""} objective.` });
    if (goal?.needsPixel && !s.pixelId) errors.push({ at: where, text: `${name}: the ${goal.label} goal needs your Meta Pixel. Choose it, or pick "Store visits" until the Pixel is set up.` });
    if (goal?.needsPage && !(s.ads || []).every((a) => a.identity?.pageId)) errors.push({ at: where, text: `${name}: WhatsApp ads need a Facebook Page linked to your WhatsApp Business number.` });
    if (c.bidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && s.goal !== "purchases") errors.push({ at: where, text: `${name}: a ROAS goal only works with the Purchases goal.` });
    if (!cbo) {
      if (!(Number(s.budget) > 0)) errors.push({ at: where, text: `${name}: set its budget.` });
      else if (!lifetime && Number(s.budget) < MIN_DAILY) warnings.push({ at: where, text: `${name}: a daily budget under ₹${MIN_DAILY} usually delivers very little.` });
    }
    const end = s.endTime || c.endTime;
    if (lifetime && !end) errors.push({ at: where, text: `${name}: a lifetime budget needs an end date.` });
    if (s.startTime && end && new Date(end) <= new Date(s.startTime)) errors.push({ at: where, text: `${name}: the end must be after the start.` });
    if (end && new Date(end) < new Date()) errors.push({ at: where, text: `${name}: the end date has passed.` });
    const t = s.targeting || {};
    if (!(t.countries || []).length && !(t.regions || []).length && !(t.cities || []).length) errors.push({ at: where, text: `${name}: choose where to show the ads (a country, state or city).` });
    if (t.ageMin && t.ageMax && Number(t.ageMin) > Number(t.ageMax)) errors.push({ at: where, text: `${name}: the minimum age is above the maximum.` });
    if (Number(t.ageMin) < 18) errors.push({ at: where, text: `${name}: the minimum age is 18.` });
    if (special.length && ((t.genders || []).length || Number(t.ageMin) > 18 || (Number(t.ageMax) && Number(t.ageMax) < 65))) warnings.push({ at: where, text: `${name}: age and gender limits are removed for special ad categories.` });
    if (t.advantageAudience && Number(t.ageMax) && Number(t.ageMax) < 65) warnings.push({ at: where, text: `${name}: with Advantage+ audience on, your age range is a suggestion — Meta may show ads to people outside it.` });
    if (s.placements?.mode === "manual" && !(s.placements.platforms || []).length) errors.push({ at: where, text: `${name}: choose at least one placement, or use automatic placements.` });
    if (goal?.destination === "WHATSAPP" && s.placements?.mode === "manual" && (s.placements.platforms || []).includes("audience_network")) errors.push({ at: where, text: `${name}: WhatsApp ads can't run on Audience Network.` });
    const ads = Array.isArray(s.ads) ? s.ads : [];
    if (!ads.length) errors.push({ at: where, text: `${name}: add at least one ad.` });
    if (ads.length > 50) errors.push({ at: where, text: `${name}: up to 50 ads per ad set.` });
    ads.forEach((a, j) => {
      const aw = `ad:${a.key || `${i}-${j}`}`;
      const an = `${name} › ${a.name || `Ad ${j + 1}`}`;
      if (!a.identity?.pageId) errors.push({ at: aw, text: `${an}: choose the Facebook Page it runs from.` });
      if (!txt(a.primaryText, 2200)) errors.push({ at: aw, text: `${an}: write the primary text.` });
      else if (a.primaryText.length > 125) warnings.push({ at: aw, text: `${an}: primary text over 125 characters is cut off with "See more" in most placements.` });
      if (a.headline && a.headline.length > 40) warnings.push({ at: aw, text: `${an}: headlines over 40 characters get cut off on phones.` });
      if (goal?.destination !== "WHATSAPP" && goal?.destination !== "ON_POST" && goal?.destination !== "ON_VIDEO") {
        if (!/^https:\/\/[^\s]+$/i.test(a.link || "")) errors.push({ at: aw, text: `${an}: the website link must be a full https:// address.` });
      }
      if (a.format === "image" && !a.imageHash) errors.push({ at: aw, text: `${an}: choose an image from your media library.` });
      if (a.format === "video" && !a.videoId) errors.push({ at: aw, text: `${an}: choose a video.` });
      if (a.format === "video" && !a.thumbnailHash) errors.push({ at: aw, text: `${an}: video ads need a cover image (thumbnail).` });
      if (goal?.needsVideo && a.format !== "video") errors.push({ at: aw, text: `${an}: the video views goal needs a video ad.` });
      if (a.format === "carousel") {
        const cards = a.cards || [];
        if (cards.length < 2 || cards.length > 10) errors.push({ at: aw, text: `${an}: a carousel needs 2 to 10 cards.` });
        cards.forEach((card, k) => {
          if (!card.imageHash) errors.push({ at: aw, text: `${an}: card ${k + 1} needs an image.` });
          if (goal?.destination === "WEBSITE" && !/^https:\/\//i.test(card.link || a.link || "")) errors.push({ at: aw, text: `${an}: card ${k + 1} needs a https:// link.` });
        });
      }
      if (a.identity?.instagramId === undefined && caps.instagram === false) warnings.push({ at: aw, text: `${an}: no Instagram account linked to the Page — Instagram placements use the Page's name and picture.` });
    });
  });
  return { errors, warnings, ok: errors.length === 0 };
}

/** Marketing API targeting from the spec. */
function targeting(t = {}, special = []) {
  const geo = {};
  if ((t.countries || []).length) geo.countries = t.countries.slice(0, 25);
  if ((t.regions || []).length) geo.regions = t.regions.map((r) => ({ key: String(r.key) }));
  if ((t.cities || []).length) geo.cities = t.cities.map((c) => ({ key: String(c.key), radius: Math.min(80, Math.max(1, Number(c.radius) || 10)), distance_unit: "kilometer" }));
  geo.location_types = ["home", "recent"];
  const out = { geo_locations: geo };
  if ((t.excludedRegions || []).length || (t.excludedCities || []).length) {
    out.excluded_geo_locations = {
      ...((t.excludedRegions || []).length ? { regions: t.excludedRegions.map((r) => ({ key: String(r.key) })) } : {}),
      ...((t.excludedCities || []).length ? { cities: t.excludedCities.map((c) => ({ key: String(c.key), radius: Number(c.radius) || 10, distance_unit: "kilometer" })) } : {}),
    };
  }
  if (!special.length) {
    if (Number(t.ageMin) >= 18) out.age_min = Math.min(65, Number(t.ageMin));
    if (Number(t.ageMax) >= 18) out.age_max = Math.min(65, Number(t.ageMax));
    if ((t.genders || []).length === 1) out.genders = t.genders.map(Number);
  }
  if ((t.locales || []).length) out.locales = t.locales.map((l) => Number(l.key ?? l)).filter(Number.isFinite);
  if ((t.interests || []).length) out.flexible_spec = [{ interests: t.interests.slice(0, 50).map((x) => ({ id: String(x.id), name: x.name })) }];
  if ((t.customAudiences || []).length) out.custom_audiences = t.customAudiences.map((a) => ({ id: String(a.id ?? a) }));
  if ((t.excludedAudiences || []).length) out.excluded_custom_audiences = t.excludedAudiences.map((a) => ({ id: String(a.id ?? a) }));
  out.targeting_automation = { advantage_audience: t.advantageAudience ? 1 : 0 };
  return out;
}

function placements(p = {}, out) {
  if (p.mode !== "manual") return out;
  const platforms = (p.platforms || []).filter((x) => PLACEMENTS.platforms.includes(x));
  out.publisher_platforms = platforms;
  if (platforms.includes("facebook") && (p.facebook || []).length) out.facebook_positions = p.facebook.filter((x) => PLACEMENTS.facebook.includes(x));
  if (platforms.includes("instagram") && (p.instagram || []).length) out.instagram_positions = p.instagram.filter((x) => PLACEMENTS.instagram.includes(x));
  if (platforms.includes("messenger")) out.messenger_positions = ["messenger_home", "story"];
  if (platforms.includes("audience_network")) out.audience_network_positions = ["classic", "rewarded_video"];
  if ((p.devices || []).length === 1) out.device_platforms = p.devices.filter((x) => PLACEMENTS.devices.includes(x));
  return out;
}

const URL_TAGS = "utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}";

function campaignPayload(spec) {
  const c = spec.campaign;
  const body = {
    name: txt(c.name, 400),
    objective: c.objective,
    status: "PAUSED",
    buying_type: "AUCTION",
    special_ad_categories: (c.specialAdCategories || []).filter((x) => SPECIAL_CATEGORIES[x]),
  };
  if (c.budgetLevel === "campaign") {
    body[c.budgetType === "lifetime" ? "lifetime_budget" : "daily_budget"] = paise(c.budget);
    body.bid_strategy = BID_STRATEGIES[c.bidStrategy] ? c.bidStrategy : "LOWEST_COST_WITHOUT_CAP";
  } else {
    // Ad set budgets: Meta now asks whether budget may be shared between ad sets.
    body.is_adset_budget_sharing_enabled = false;
  }
  return body;
}

function adSetPayload(spec, s, campaignId) {
  const c = spec.campaign;
  const goal = GOALS[s.goal];
  const special = (c.specialAdCategories || []).filter((x) => SPECIAL_CATEGORIES[x]);
  const body = {
    name: txt(s.name, 400) || "Ad set",
    campaign_id: campaignId,
    status: "PAUSED",
    optimization_goal: goal.optimization,
    billing_event: goal.billing,
    targeting: placements(s.placements, targeting(s.targeting, special)),
  };
  if (goal.destination) body.destination_type = goal.destination;
  if (goal.needsPixel) body.promoted_object = { pixel_id: String(s.pixelId), custom_event_type: goal.event };
  if (goal.destination === "WHATSAPP") body.promoted_object = { page_id: String(s.ads?.[0]?.identity?.pageId || "") };
  const start = s.startTime || c.startTime;
  const end = s.endTime || c.endTime;
  if (start) body.start_time = iso(start);
  if (end) body.end_time = iso(end);
  if (c.budgetLevel !== "campaign") {
    body[c.budgetType === "lifetime" ? "lifetime_budget" : "daily_budget"] = paise(s.budget);
    body.bid_strategy = BID_STRATEGIES[c.bidStrategy] ? c.bidStrategy : "LOWEST_COST_WITHOUT_CAP";
  }
  if (["COST_CAP", "LOWEST_COST_WITH_BID_CAP"].includes(c.bidStrategy)) body.bid_amount = paise(s.bidAmount || c.bidAmount);
  if (c.bidStrategy === "LOWEST_COST_WITH_MIN_ROAS") body.bid_constraints = { roas_average_floor: Math.round(Number(c.roasFloor) * 10000) };
  return body;
}

/** The creative's object_story_spec for one ad. */
function storySpec(a, goal) {
  const pageId = String(a.identity.pageId);
  const ig = a.identity.instagramId ? { instagram_user_id: String(a.identity.instagramId) } : {};
  const whatsapp = goal?.destination === "WHATSAPP";
  const ctaType = whatsapp ? "WHATSAPP_MESSAGE" : CTAS.includes(a.cta) ? a.cta : "SHOP_NOW";
  const link = whatsapp ? "https://api.whatsapp.com/send" : a.link;
  const cta = { type: ctaType, value: whatsapp ? { app_destination: "WHATSAPP" } : { link } };
  if (a.format === "video") {
    return {
      page_id: pageId,
      ...ig,
      video_data: {
        video_id: String(a.videoId),
        image_hash: a.thumbnailHash,
        message: a.primaryText,
        title: a.headline || undefined,
        link_description: a.description || undefined,
        call_to_action: cta,
      },
    };
  }
  if (a.format === "carousel") {
    return {
      page_id: pageId,
      ...ig,
      link_data: {
        link,
        message: a.primaryText,
        multi_share_optimized: true,
        multi_share_end_card: false,
        child_attachments: (a.cards || []).map((card) => ({
          link: whatsapp ? link : card.link || a.link,
          image_hash: card.imageHash,
          name: card.headline || undefined,
          description: card.description || undefined,
          call_to_action: { type: ctaType, value: whatsapp ? { app_destination: "WHATSAPP" } : { link: card.link || a.link } },
        })),
        call_to_action: cta,
      },
    };
  }
  return {
    page_id: pageId,
    ...ig,
    link_data: {
      link,
      message: a.primaryText,
      name: a.headline || undefined,
      description: a.description || undefined,
      image_hash: a.imageHash,
      call_to_action: cta,
    },
  };
}

function creativePayload(a, goal) {
  return {
    name: `${txt(a.name, 200) || "Ad"} — creative`,
    object_story_spec: storySpec(a, goal),
    ...(goal?.destination === "WEBSITE" ? { url_tags: URL_TAGS } : {}),
  };
}

/** Throws the first blocking problem (used right before publishing). */
function assertPublishable(spec, caps) {
  const r = check(spec, caps);
  if (!r.ok) throw new HttpError(400, r.errors[0].text, { errors: r.errors, warnings: r.warnings });
  return r;
}

module.exports = { OBJECTIVES, GOALS, BID_STRATEGIES, CTAS, SPECIAL_CATEGORIES, PLACEMENTS, MIN_DAILY, URL_TAGS, check, assertPublishable, targeting, campaignPayload, adSetPayload, creativePayload, storySpec, paise };
