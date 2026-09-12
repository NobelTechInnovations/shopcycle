const { HttpError } = require("@shopcycle/utils");
const metaService = require("../meta/service");
const metaRepository = require("../meta/repository");

/** Two objective presets rather than exposing Marketing API's full
 * objective/optimization_goal/billing_event matrix — the two that cover
 * what a store owner actually wants ("send people to my store" and "get
 * engagement on my page post"). OUTCOME_SALES/OUTCOME_LEADS need a Meta
 * Pixel or Lead form already set up to optimize against, which nothing in
 * this platform provisions yet — adding those is a matter of extending
 * this map once that exists, not a structural change. */
const OBJECTIVES = {
  traffic: {
    label: "Traffic to my store",
    objective: "OUTCOME_TRAFFIC",
    optimization_goal: "LINK_CLICKS",
    billing_event: "LINK_CLICKS",
  },
  engagement: {
    label: "Engagement on my page",
    objective: "OUTCOME_ENGAGEMENT",
    optimization_goal: "POST_ENGAGEMENT",
    billing_event: "IMPRESSIONS",
  },
};

async function getReadyConnection(prisma, storeId) {
  const connection = await metaRepository.findByStore(prisma, storeId);
  if (!connection) throw new HttpError(400, "Connect Facebook first (Apps ▸ Meta Ads ▸ Connect).");
  if (!connection.adAccountId || !connection.pageId) {
    throw new HttpError(400, "Select an ad account and page first (Apps ▸ Meta Ads ▸ Connect).");
  }
  return connection;
}

async function listCampaigns(prisma, store) {
  const connection = await getReadyConnection(prisma, store.id);
  const [remote, local] = await Promise.all([
    metaService.graphRequest(`/${connection.adAccountId}/campaigns`, {
      token: connection.accessToken,
      params: { fields: "id,name,objective,effective_status", limit: 50 },
    }),
    prisma.adCampaign.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const localById = Object.fromEntries(local.map((c) => [c.metaCampaignId, c]));
  return (remote.data || []).map((c) => ({
    id: c.id,
    name: c.name,
    objective: c.objective,
    status: c.effective_status,
    dailyBudget: localById[c.id]?.dailyBudget ?? null,
    createdAt: localById[c.id]?.createdAt ?? null,
  }));
}

/** Campaign → ad set → creative → ad, in that order — each step needs the
 * id the previous one returned. `dailyBudget` arrives in rupees (what the
 * merchant typed) and is converted to paise here, since that's the minor-
 * unit integer the Marketing API expects for an INR ad account. A single
 * external image URL (`imageUrl`) is used directly as the creative's
 * `picture` rather than uploading image bytes via /adimages first — one
 * fewer round trip, and it's exactly what Graph API's link_data accepts. */
async function createCampaign(prisma, store, input) {
  const connection = await getReadyConnection(prisma, store.id);
  const preset = OBJECTIVES[input.objectivePreset];
  if (!preset) throw new HttpError(400, "Unknown objective");

  const campaign = await metaService.graphRequest(`/${connection.adAccountId}/campaigns`, {
    method: "POST",
    token: connection.accessToken,
    body: {
      name: input.name,
      objective: preset.objective,
      status: "PAUSED",
      special_ad_categories: [],
    },
  });

  const adSet = await metaService.graphRequest(`/${connection.adAccountId}/adsets`, {
    method: "POST",
    token: connection.accessToken,
    body: {
      name: `${input.name} - Ad set`,
      campaign_id: campaign.id,
      daily_budget: Math.round(input.dailyBudget * 100),
      billing_event: preset.billing_event,
      optimization_goal: preset.optimization_goal,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: { geo_locations: { countries: [input.countryCode || "IN"] } },
      status: "PAUSED",
    },
  });

  const creative = await metaService.graphRequest(`/${connection.adAccountId}/adcreatives`, {
    method: "POST",
    token: connection.accessToken,
    body: {
      name: `${input.name} - Creative`,
      object_story_spec: {
        page_id: connection.pageId,
        link_data: {
          message: input.primaryText,
          name: input.headline,
          link: input.destinationUrl,
          picture: input.imageUrl,
          call_to_action: { type: "SHOP_NOW", value: { link: input.destinationUrl } },
        },
      },
    },
  });

  await metaService.graphRequest(`/${connection.adAccountId}/ads`, {
    method: "POST",
    token: connection.accessToken,
    body: {
      name: input.name,
      adset_id: adSet.id,
      creative: { creative_id: creative.id },
      status: "PAUSED",
    },
  });

  return prisma.adCampaign.create({
    data: {
      storeId: store.id,
      metaCampaignId: campaign.id,
      name: input.name,
      objective: preset.objective,
      status: "PAUSED",
      dailyBudget: input.dailyBudget,
    },
  });
}

/** Meta always creates a new campaign PAUSED (see createCampaign) so a
 * merchant reviews it before it can spend anything — this is the one
 * explicit step that turns it on, or pauses it again later. */
async function setCampaignStatus(prisma, store, metaCampaignId, status) {
  const connection = await getReadyConnection(prisma, store.id);
  await metaService.graphRequest(`/${metaCampaignId}`, {
    method: "POST",
    token: connection.accessToken,
    body: { status },
  });
  await prisma.adCampaign.updateMany({ where: { storeId: store.id, metaCampaignId }, data: { status } });
}

module.exports = { OBJECTIVES, listCampaigns, createCampaign, setCampaignStatus };
