const { HttpError } = require("@shopcycle/utils");
const { inviteTeamMemberSchema, updateTeamMemberRoleSchema, acceptInvitationSchema } = require("@shopcycle/validation");
const { env } = require("../../config/env");
const service = require("./service");

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

function assertCanManageTeam(request) {
  if (request.storeRole === "staff") {
    throw new HttpError(403, "Only owners and admins can manage the team");
  }
}

async function listHandler(request, reply) {
  const result = await service.listTeam(request.server.prisma, request.store.id);
  reply.send(result);
}

async function inviteHandler(request, reply) {
  assertCanManageTeam(request);
  const body = inviteTeamMemberSchema.parse(request.body);
  const result = await service.inviteMember(request.server.prisma, request.store, body);
  reply.code(201).send(result);
}

async function updateRoleHandler(request, reply) {
  assertCanManageTeam(request);
  const body = updateTeamMemberRoleSchema.parse(request.body);
  const member = await service.updateMemberRole(request.server.prisma, request.store.id, request.params.id, body.role);
  reply.send({ member });
}

async function removeHandler(request, reply) {
  assertCanManageTeam(request);
  await service.removeMember(request.server.prisma, request.store.id, request.params.id, request.currentUser.id);
  reply.code(204).send();
}

async function cancelInvitationHandler(request, reply) {
  assertCanManageTeam(request);
  await service.cancelInvitation(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

async function acceptInvitationHandler(request, reply) {
  const body = acceptInvitationSchema.parse(request.body);
  const { user } = await service.acceptInvitation(request.server.prisma, body);
  const token = request.server.jwt.sign({ userId: user.id });
  reply.setCookie(env.COOKIE_NAME, token, cookieOptions);
  reply.code(201).send({ user: { id: user.id, name: user.name, email: user.email } });
}

module.exports = {
  listHandler,
  inviteHandler,
  updateRoleHandler,
  removeHandler,
  cancelInvitationHandler,
  acceptInvitationHandler,
};
