const { z } = require("zod");

const createCampaignSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  utmSource: z.string().min(1, "Source is required").max(60),
  utmMedium: z.string().min(1, "Medium is required").max(60),
  utmCampaign: z.string().min(1, "Campaign is required").max(60),
  utmTerm: z.string().max(120).optional().nullable(),
  utmContent: z.string().max(120).optional().nullable(),
  destinationPath: z.string().max(255).default("/"),
});

const overviewQuerySchema = z.object({
  range: z.enum(["today", "7d", "30d", "90d"]).default("7d"),
});

module.exports = { createCampaignSchema, overviewQuerySchema };
