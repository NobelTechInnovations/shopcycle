const { Resolver } = require("dns").promises;
const { HttpError } = require("@shopcycle/utils");
const { env, isInfraDomain } = require("../../config/env");
const { oyklaneAddress, redirectsToDomain } = require("../../lib/storefront-url");
const { RESERVED_HANDLES } = require("../../lib/store-provisioning");

/**
 * Store addresses. Every store is live at {handle}.<root domain> from the
 * moment it's created (the storefront maps the subdomain to the store with
 * no lookup). A merchant can also connect a domain they own:
 *
 *   shop.example.com  →  CNAME  shop  → STOREFRONT_CNAME_TARGET
 *   example.com       →  A      @     → STOREFRONT_APEX_IP
 *                        CNAME  www   → STOREFRONT_CNAME_TARGET
 *
 * The storefront finds the store for a connected domain (and its www.
 * twin) through /api/storefront/resolve-domain. With VERCEL_TOKEN set,
 * connecting also adds the domain to the storefront's Vercel project, which
 * is what gets it an SSL certificate; otherwise the operator adds it there.
 */

// DNS answers come from public resolvers (Cloudflare, Google) — what the
// hosting sees — not the server's own, which can hold an old answer for
// hours after the seller changed a record.
const dns = new Resolver({ timeout: 4000, tries: 2 });
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://Shop.Example.com/path" → "shop.example.com". */
function normalizeDomain(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#:]/)[0]
    .replace(/\.$/, "");
}

/** Two labels (example.com, example.in) is an apex; co.in-style suffixes
 * are counted as part of the apex. Good enough for choosing which DNS
 * record to show. */
const TWO_PART_SUFFIXES = new Set(["co.in", "co.uk", "com.au", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "co.nz", "com.sg"]);
function isApex(domain) {
  const parts = domain.split(".");
  if (parts.length === 2) return true;
  return parts.length === 3 && TWO_PART_SUFFIXES.has(parts.slice(1).join("."));
}

const defaultAddress = (store) => oyklaneAddress(store);

function dnsRecords(domain) {
  if (!domain) return [];
  if (isApex(domain)) {
    return [
      { type: "A", name: "@", value: env.STOREFRONT_APEX_IP, host: domain },
      { type: "CNAME", name: "www", value: env.STOREFRONT_CNAME_TARGET, host: `www.${domain}` },
    ];
  }
  const label = domain.split(".").slice(0, -2).join(".");
  return [{ type: "CNAME", name: label, value: env.STOREFRONT_CNAME_TARGET, host: domain }];
}

// ── Vercel (optional) ──────────────────────────────────────────────
const vercelOn = () => Boolean(env.VERCEL_TOKEN && env.VERCEL_STOREFRONT_PROJECT_ID);

async function vercelRaw(method, path, body, teamId) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://api.vercel.com${path}${teamId ? `${sep}teamId=${encodeURIComponent(teamId)}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${env.VERCEL_TOKEN}`, ...(body && { "content-type": "application/json" }) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, data };
}

/** Which Vercel team (if any) owns the storefront project. VERCEL_TEAM_ID
 * wins; otherwise it's found once — the personal scope first, then each
 * team the token can see — and remembered. Projects under a team (even a
 * Hobby one) can't be reached without it. */
let teamScope; // undefined = not looked up yet; null = personal account
async function projectTeam() {
  if (env.VERCEL_TEAM_ID) return env.VERCEL_TEAM_ID;
  if (teamScope !== undefined) return teamScope;
  const project = encodeURIComponent(env.VERCEL_STOREFRONT_PROJECT_ID);
  if ((await vercelRaw("GET", `/v9/projects/${project}`)).ok) return (teamScope = null);
  const teams = await vercelRaw("GET", "/v2/teams?limit=50");
  if (!teams.ok) throw new Error(`Vercel refused the token (${teams.data?.error?.message || teams.status}) — create a new one with access to the team that owns the storefront project.`);
  for (const t of teams.data?.teams || []) {
    if ((await vercelRaw("GET", `/v9/projects/${project}`, null, t.id)).ok) return (teamScope = t.id);
  }
  throw new Error("The storefront project wasn't found with this Vercel token — check VERCEL_STOREFRONT_PROJECT_ID and the token's scope.");
}

async function vercel(method, path, body) {
  return vercelRaw(method, path, body, await projectTeam());
}

const vercelMessage = (r) => r.data?.error?.message || `HTTP ${r.status}`;

async function addToVercel(domain) {
  if (!vercelOn()) return { added: false };
  const project = encodeURIComponent(env.VERCEL_STOREFRONT_PROJECT_ID);
  const names = isApex(domain) ? [domain, `www.${domain}`] : [domain];
  for (const name of names) {
    const r = await vercel("POST", `/v10/projects/${project}/domains`, { name });
    if (r.ok) continue;
    // Already on our project is fine; anywhere else is a real problem.
    const mine = await vercel("GET", `/v9/projects/${project}/domains/${encodeURIComponent(name)}`);
    if (mine.ok) continue;
    if (r.status === 409) throw new HttpError(409, `${name} is already connected to another site on our hosting. It has to be removed there first.`);
    throw new HttpError(502, `Couldn't add ${name} to hosting: ${vercelMessage(r)}`);
  }
  return { added: true };
}

async function removeFromVercel(domain) {
  if (!vercelOn() || !domain) return;
  const project = encodeURIComponent(env.VERCEL_STOREFRONT_PROJECT_ID);
  const names = isApex(domain) ? [domain, `www.${domain}`] : [domain];
  for (const name of names) await vercel("DELETE", `/v9/projects/${project}/domains/${encodeURIComponent(name)}`).catch(() => {});
}

// ── Checks ─────────────────────────────────────────────────────────
async function checkRecord(record) {
  try {
    if (record.type === "A") {
      const ips = await dns.resolve4(record.host);
      return { ...record, found: ips, ok: ips.includes(record.value) };
    }
    const cnames = await dns.resolveCname(record.host).catch(() => []);
    const want = record.value.replace(/\.$/, "");
    if (cnames.some((c) => c.replace(/\.$/, "") === want || c.endsWith(".vercel-dns.com"))) return { ...record, found: cnames, ok: true };
    // Some DNS hosts flatten CNAMEs into A records.
    const ips = await dns.resolve4(record.host).catch(() => []);
    return { ...record, found: cnames.length ? cnames : ips, ok: ips.includes(env.STOREFRONT_APEX_IP) };
  } catch {
    return { ...record, found: [], ok: false };
  }
}

/** The real test: does https://<domain>/ answer with this store? The
 * storefront tags every store response with x-oyklane-store. This fails
 * until DNS points here AND the hosting has the domain with an SSL
 * certificate — exactly the moment shoppers can use it. */
async function probeLive(domain, handle) {
  try {
    const res = await fetch(`https://${domain}/`, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000) });
    return res.headers.get("x-oyklane-store") === handle;
  } catch {
    return false;
  }
}

/** What the hosting says about the domain over plain HTTP. Vercel answers
 * DEPLOYMENT_NOT_FOUND for a domain that points at it but isn't added to
 * any project — no site, so no certificate can ever be issued. */
async function probeHosting(domain) {
  try {
    const res = await fetch(`http://${domain}/`, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    const body = res.status === 404 ? await res.text().catch(() => "") : "";
    return { notAdded: res.status === 404 && /DEPLOYMENT_NOT_FOUND/i.test(body) };
  } catch {
    return { notAdded: false };
  }
}

/** The TXT values published for `host` (each record's strings joined). */
async function txtValues(host) {
  try {
    return (await dns.resolveTxt(host)).map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

/** With a Vercel token: make sure the domain (and its www twin) is on the
 * storefront project, adding it if it isn't. When the hosting wants proof
 * of ownership (a TXT record — it asks when the domain was used on another
 * account), it's asked to verify again right now, so the domain goes live
 * the moment the record is in DNS instead of on the hosting's own schedule.
 * Each record it still wants comes back with what DNS shows for it. */
async function ensureOnVercel(domain) {
  const project = encodeURIComponent(env.VERCEL_STOREFRONT_PROJECT_ID);
  const names = isApex(domain) ? [domain, `www.${domain}`] : [domain];
  let error = null;
  let added = true;
  const wanted = new Map(); // "<host> <value>" → Vercel's record
  for (const name of names) {
    const path = `/v9/projects/${project}/domains/${encodeURIComponent(name)}`;
    let r = await vercel("GET", path);
    if (r.status === 404) {
      await addToVercel(domain).catch((err) => {
        error = err.message;
      });
      r = await vercel("GET", path);
    }
    if (!r.ok) {
      added = false;
      error = error || `Hosting lookup failed: ${vercelMessage(r)}`;
      continue;
    }
    if (r.data?.verified !== false) continue;
    const again = await vercel("POST", `${path}/verify`);
    if (again.ok && again.data?.verified) continue;
    for (const v of r.data?.verification || []) wanted.set(`${v.domain} ${v.value}`, v);
  }
  const verification = await Promise.all(
    [...wanted.values()].map(async (v) => {
      const found = v.type === "TXT" ? await txtValues(v.domain) : [];
      return {
        type: v.type,
        name: String(v.domain || "").replace(new RegExp(`\\.?${domain.replace(/\./g, "\\.")}$`), "") || "@",
        value: v.value,
        host: v.domain,
        purpose: "ownership",
        found,
        ok: found.includes(v.value),
      };
    })
  );
  return { added, verified: verification.length === 0, verification, error };
}

async function status(prisma, store) {
  const domain = store.domain || null;
  const records = dnsRecords(domain);
  const [checks, live] = domain ? await Promise.all([Promise.all(records.map(checkRecord)), probeLive(domain, store.handle)]) : [[], false];
  const dnsOk = checks.length > 0 && checks.every((c) => c.ok);

  // Not live but DNS is right: find out what the hosting still needs.
  let hosting = { managed: vercelOn(), notAdded: false, verification: [] };
  if (domain && dnsOk && !live) {
    if (vercelOn()) {
      const v = await ensureOnVercel(domain).catch((err) => ({ added: false, verification: [], error: err.message }));
      hosting = { managed: true, notAdded: !v.added, verification: v.verification || [], error: v.error || null };
    } else {
      hosting = { managed: false, ...(await probeHosting(domain)), verification: [] };
    }
  }

  // Remember whether it's live: links and redirects switch to the domain
  // only then (see storefront-url.js and the storefront proxy).
  if (prisma && domain && live !== Boolean(store.domainVerifiedAt)) {
    await prisma.store.update({ where: { id: store.id }, data: { domainVerifiedAt: live ? new Date() : null } });
  }

  // Why it isn't live yet, in the order a merchant would fix it.
  const stage = !domain ? null : live ? "live" : !dnsOk ? "dns" : "hosting";
  return {
    defaultAddress: defaultAddress(store),
    rootDomain: env.STOREFRONT_ROOT_DOMAIN,
    domain,
    kind: domain ? (isApex(domain) ? "apex" : "subdomain") : null,
    records: checks,
    dnsOk,
    live,
    connected: live,
    stage,
    redirect: redirectsToDomain(store),
    handle: store.handle,
    hosting,
  };
}

/** Send the Oyklane address to the store's own domain, or keep both working. */
async function setRedirect(prisma, store, redirect) {
  const settings = { ...(store.settings && typeof store.settings === "object" ? store.settings : {}), domainRedirect: Boolean(redirect) };
  const updated = await prisma.store.update({ where: { id: store.id }, data: { settings } });
  return status(prisma, updated);
}

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Changes {handle}.<root>. The store's id — and so all its data — stays
 * the same; the old address simply stops answering. */
async function changeHandle(prisma, store, input) {
  const handle = String(input || "").trim().toLowerCase();
  if (handle === store.handle) return status(prisma, store);
  if (!HANDLE_RE.test(handle) || handle.includes("--")) {
    throw new HttpError(400, "Use 3–40 lowercase letters, numbers and single dashes, starting and ending with a letter or number.");
  }
  if (RESERVED_HANDLES.has(handle)) throw new HttpError(400, "That name is reserved — pick another.");
  const taken = await prisma.store.findUnique({ where: { handle }, select: { id: true } });
  if (taken) throw new HttpError(409, "Another store already uses that name.");
  const updated = await prisma.store.update({ where: { id: store.id }, data: { handle } });
  return status(prisma, updated);
}

/** Background: stores whose domain isn't live yet get re-checked, so they
 * switch to their domain as soon as DNS and HTTPS are ready. */
async function recheckPending(prisma, { limit = 20 } = {}) {
  const stores = await prisma.store.findMany({ where: { domain: { not: null }, domainVerifiedAt: null }, take: limit, orderBy: { updatedAt: "asc" } });
  let live = 0;
  for (const store of stores) {
    const r = await status(prisma, store).catch(() => null);
    if (r?.live) live += 1;
  }
  return { checked: stores.length, live };
}

async function connect(prisma, store, input) {
  const domain = normalizeDomain(input).replace(/^www\./, "");
  if (!DOMAIN_RE.test(domain)) throw new HttpError(400, "Enter a domain like shop.example.com or example.com.");
  const root = env.STOREFRONT_ROOT_DOMAIN;
  if (isInfraDomain(domain)) throw new HttpError(400, "Enter a domain you own — hosting-provider addresses can't be connected.");
  if (domain === root || domain.endsWith(`.${root}`)) {
    throw new HttpError(400, `${defaultAddress(store)} is already your store's free address — enter a domain you own.`);
  }
  const taken = await prisma.store.findFirst({ where: { domain, id: { not: store.id } }, select: { id: true } });
  if (taken) throw new HttpError(409, "That domain is already connected to another store.");
  if (store.domain && store.domain !== domain) await removeFromVercel(store.domain);
  await addToVercel(domain);
  const updated = await prisma.store.update({ where: { id: store.id }, data: { domain, domainVerifiedAt: null } });
  return status(prisma, updated);
}

async function disconnect(prisma, store) {
  await removeFromVercel(store.domain);
  const updated = await prisma.store.update({ where: { id: store.id }, data: { domain: null, domainVerifiedAt: null } });
  return status(prisma, updated);
}

module.exports = { status, connect, disconnect, setRedirect, changeHandle, recheckPending, normalizeDomain, isApex };
