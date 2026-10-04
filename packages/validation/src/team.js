const { z } = require("zod");

const inviteTeamMemberSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["admin", "staff"]).default("staff"),
});

const updateTeamMemberRoleSchema = z.object({
  role: z.enum(["owner", "admin", "staff"]),
});

const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2, "Name is too short").max(120),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

module.exports = { inviteTeamMemberSchema, updateTeamMemberRoleSchema, acceptInvitationSchema };
