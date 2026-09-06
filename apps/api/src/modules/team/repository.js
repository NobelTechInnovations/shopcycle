// Never select passwordHash here — this row travels straight to the admin
// UI's Team tab as JSON.
const safeUserSelect = { id: true, name: true, email: true, status: true, createdAt: true };

function listMembers(prisma, storeId) {
  return prisma.storeUser.findMany({
    where: { storeId },
    include: { user: { select: safeUserSelect } },
    orderBy: { createdAt: "asc" },
  });
}

function listInvitations(prisma, storeId) {
  return prisma.invitation.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } });
}

function findMemberById(prisma, storeId, id) {
  return prisma.storeUser.findFirst({ where: { id, storeId }, include: { user: { select: safeUserSelect } } });
}

function findMemberByUserId(prisma, storeId, userId) {
  return prisma.storeUser.findFirst({ where: { storeId, userId } });
}

function countMembers(prisma, storeId) {
  return prisma.storeUser.count({ where: { storeId } });
}

function countOwners(prisma, storeId) {
  return prisma.storeUser.count({ where: { storeId, role: "owner" } });
}

function createMember(prisma, storeId, userId, role) {
  return prisma.storeUser.create({ data: { storeId, userId, role }, include: { user: { select: safeUserSelect } } });
}

function updateMemberRole(prisma, id, role) {
  return prisma.storeUser.update({ where: { id }, data: { role }, include: { user: { select: safeUserSelect } } });
}

function removeMember(prisma, id) {
  return prisma.storeUser.delete({ where: { id } });
}

function findInvitationByEmail(prisma, storeId, email) {
  return prisma.invitation.findFirst({ where: { storeId, email } });
}

function findInvitationById(prisma, storeId, id) {
  return prisma.invitation.findFirst({ where: { id, storeId } });
}

function findInvitationByToken(prisma, token) {
  return prisma.invitation.findUnique({ where: { token }, include: { store: true } });
}

function createInvitation(prisma, storeId, data) {
  return prisma.invitation.create({ data: { ...data, storeId } });
}

function deleteInvitation(prisma, id) {
  return prisma.invitation.delete({ where: { id } });
}

function findUserByEmail(prisma, email) {
  return prisma.user.findUnique({ where: { email } });
}

module.exports = {
  listMembers,
  listInvitations,
  findMemberById,
  findMemberByUserId,
  countMembers,
  countOwners,
  createMember,
  updateMemberRole,
  removeMember,
  findInvitationByEmail,
  findInvitationById,
  findInvitationByToken,
  createInvitation,
  deleteInvitation,
  findUserByEmail,
};
