const { z } = require("zod");

const installAppSchema = z.object({
  settings: z.record(z.string(), z.string()).default({}),
});

module.exports = { installAppSchema };
