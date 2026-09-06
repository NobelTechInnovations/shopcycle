const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function listTeam(prisma, storeId) {
  const [members, invitations] = await Promise.all([
    repository.listMembers(prisma, storeId),
    repository.listInvitations(prisma, storeId),
  ]);
  return { members, invitations };
}

/** A person who already has a ShopCycle account (owns/staffs a different
 * store) joins this one immediately — no separate signup step needed, just
 * a new StoreUser row. Someone new gets a pending Invitation instead; there's
 * no transactional email wired up in this app, so the invite link itself is
 * the thing to share (see the admin Team tab's "Copy invite link"). */
async function inviteMember(prisma, store, input) {
  const existingUser = await repository.findUserByEmail(prisma, input.email);
  if (existingUser) {
    const alreadyMember = await repository.findMemberByUserId(prisma, store.id, existingUser.id);
    if (alreadyMember) throw new HttpError(409, "This person is already on your team");
  }
  const existingInvite = await repository.findInvitationByEmail(prisma, store.id, input.email);
  if (existingInvite) throw new HttpError(409, "An invitation is already pending for this email");

  if (store.plan) {
    const [memberCount, invitations] = await Promise.all([
      repository.countMembers(prisma, store.id),
      repository.listInvitations(prisma, store.id),
    ]);
    if (memberCount + invitations.length >= store.plan.staffLimit) {
      throw new HttpError(
        400,
        `Your ${store.plan.name} plan allows up to ${store.plan.staffLimit} staff accounts. Upgrade to invite more.`
      );
    }
  }

  if (existingUser) {
    const member = await repository.createMember(prisma, store.id, existingUser.id, input.role);
    return { member };
  }

  const token = crypto.randomBytes(24).toString("hex");
  const invitation = await repository.createInvitation(prisma, store.id, {
    email: input.email,
    role: input.role,
    token,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  return { invitation };
}

function assertNotLastOwner(currentRole, ownerCount, nextRole) {
  if (currentRole === "owner" && ownerCount <= 1 && nextRole !== "owner") {
    throw new HttpError(400, "A store must always have at least one owner");
  }
}

async function updateMemberRole(prisma, storeId, storeUserId, role) {
  const member = await repository.findMemberById(prisma, storeId, storeUserId);
  if (!member) throw new HttpError(404, "Team member not found");
  const ownerCount = await repository.countOwners(prisma, storeId);
  assertNotLastOwner(member.role, ownerCount, role);
  return repository.updateMemberRole(prisma, storeUserId, role);
}

async function removeMember(prisma, storeId, storeUserId, requestingUserId) {
  const member = await repository.findMemberById(prisma, storeId, storeUserId);
  if (!member) throw new HttpError(404, "Team member not found");
  if (member.userId === requestingUserId) throw new HttpError(400, "You can't remove yourself");
  const ownerCount = await repository.countOwners(prisma, storeId);
  assertNotLastOwner(member.role, ownerCount, "staff");
  await repository.removeMember(prisma, storeUserId);
}

async function cancelInvitation(prisma, storeId, id) {
  const invitation = await repository.findInvitationById(prisma, storeId, id);
  if (!invitation) throw new HttpError(404, "Invitation not found");
  await repository.deleteInvitation(prisma, id);
}

async function acceptInvitation(prisma, { token, name, password }) {
  const invitation = await repository.findInvitationByToken(prisma, token);
  if (!invitation) throw new HttpError(404, "Invitation not found or already used");
  if (invitation.expiresAt < new Date()) {
    await repository.deleteInvitation(prisma, invitation.id);
    throw new HttpError(400, "This invitation has expired");
  }

  let user = await repository.findUserByEmail(prisma, invitation.email);
  if (!user) {
    const passwordHash = await bcrypt.hash(password, 10);
    user = await prisma.user.create({ data: { name, email: invitation.email, passwordHash } });
  }

  const alreadyMember = await repository.findMemberByUserId(prisma, invitation.storeId, user.id);
  if (!alreadyMember) {
    await repository.createMember(prisma, invitation.storeId, user.id, invitation.role);
  }
  await repository.deleteInvitation(prisma, invitation.id);

  return { user, store: invitation.store };
}

module.exports = { listTeam, inviteMember, updateMemberRole, removeMember, cancelInvitation, acceptInvitation };
