"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { PARTNER_COOKIE } from "@/lib/config";

const COOKIE = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 };
const str = (fd, k) => {
  const v = fd.get(k);
  return v == null ? undefined : String(v).trim();
};
const fail = (err) => ({ error: err.message || "Something went wrong.", details: err.details || null });

export async function signUp(_prev, fd) {
  let out;
  try {
    out = await api("/api/partners/register", { method: "POST", body: { name: str(fd, "name"), email: str(fd, "email"), password: String(fd.get("password") || ""), company: str(fd, "company") || null } });
  } catch (err) {
    return fail(err);
  }
  (await cookies()).set(PARTNER_COOKIE, out.token, COOKIE);
  redirect("/partners/dashboard");
}

export async function signIn(_prev, fd) {
  let out;
  try {
    out = await api("/api/partners/login", { method: "POST", body: { email: str(fd, "email"), password: String(fd.get("password") || "") } });
  } catch (err) {
    return fail(err);
  }
  (await cookies()).set(PARTNER_COOKIE, out.token, COOKIE);
  const next = str(fd, "next");
  redirect(next && next.startsWith("/partners/") ? next : "/partners/dashboard");
}

export async function signOut() {
  (await cookies()).delete(PARTNER_COOKIE);
  redirect("/");
}

export async function signOutEverywhere() {
  await api("/api/partners/sign-out-everywhere", { method: "POST", body: {}, auth: true }).catch(() => {});
  (await cookies()).delete(PARTNER_COOKIE);
  redirect("/partners/login");
}

export async function saveProfile(_prev, fd) {
  try {
    await api("/api/partners/me", {
      method: "PATCH",
      auth: true,
      body: { name: str(fd, "name"), company: str(fd, "company") || null, website: str(fd, "website") || "", payoutUpi: str(fd, "payoutUpi") || "", payoutName: str(fd, "payoutName") || null },
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/partners/account");
  return { ok: "Saved." };
}

function listingBody(fd) {
  const body = {
    name: str(fd, "name"),
    tagline: str(fd, "tagline") || null,
    description: str(fd, "description") || null,
    category: str(fd, "category"),
    price: Number(str(fd, "price") || 0),
    iconId: str(fd, "iconId") || null,
    screenshots: fd.getAll("screenshots").map(String).filter(Boolean),
  };
  if (fd.has("appUrl")) {
    Object.assign(body, {
      appUrl: str(fd, "appUrl") || "",
      installWebhook: str(fd, "installWebhook") || "",
      embedScriptUrl: str(fd, "embedScriptUrl") || "",
      supportEmail: str(fd, "supportEmail") || "",
      privacyUrl: str(fd, "privacyUrl") || "",
      scopes: fd.getAll("scopes").map(String),
    });
  }
  return body;
}

export async function createListing(_prev, fd) {
  let out;
  try {
    out = await api("/api/partners/listings", { method: "POST", auth: true, body: { kind: str(fd, "kind"), ...listingBody(fd) } });
  } catch (err) {
    return fail(err);
  }
  redirect(`/partners/listings/${out.listing.id}?created=1`);
}

export async function saveListing(_prev, fd) {
  const id = str(fd, "id");
  try {
    await api(`/api/partners/listings/${encodeURIComponent(id)}`, { method: "PATCH", auth: true, body: listingBody(fd) });
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/partners/listings/${id}`);
  return { ok: "Saved." };
}

export async function submitListing(_prev, fd) {
  const id = str(fd, "id");
  try {
    await api(`/api/partners/listings/${encodeURIComponent(id)}/submit`, { method: "POST", auth: true, body: {} });
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/partners/listings/${id}`);
  return { ok: "Sent for review — we usually reply within 2 working days." };
}

export async function rotateSecret(_prev, fd) {
  const id = str(fd, "id");
  try {
    const { secret } = await api(`/api/partners/listings/${encodeURIComponent(id)}/secret`, { method: "POST", auth: true, body: {} });
    return { secret };
  } catch (err) {
    return fail(err);
  }
}

export async function revealSecret(_prev, fd) {
  const id = str(fd, "id");
  try {
    const { secret } = await api(`/api/partners/listings/${encodeURIComponent(id)}/secret`, { auth: true });
    return { secret };
  } catch (err) {
    return fail(err);
  }
}
