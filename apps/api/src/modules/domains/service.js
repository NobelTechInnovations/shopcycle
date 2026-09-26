const dns = require("dns").promises;
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");

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

function defaultAddress(store) {
  const root = env.STOREFRONT_ROOT_DOMAIN;
  return root === "localhost" ? `${env.STOREFRONT_ORIGIN.replace(/\/$/, "")}/store/${store.handle}` : `https://${store.handle}.${root}`;
}

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

async function vercel(method, path, body) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://api.vercel.com${path}${env.VERCEL_TEAM_ID ? `${sep}teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${env.VERCEL_TOKEN}`, ...(body && { "content-type": "application/json" }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, data };
}

async function addToVercel(domain) {
  if (!vercelOn()) return { added: false };
  const project = encodeURIComponent(env.VERCEL_STOREFRONT_PROJECT_ID);
  const names = isApex(domain) ? [domain, `www.${domain}`] : [domain];
  for (const name of names) {
    const r = await vercel("POST", `/v10/projects/${project}/domains`, { name });
    // Already on this project is fine; anything else is a real problem.
    if (!r.ok && r.data?.error?.code !== "domain_already_in_use_by_project" && r.status !== 409) {
      throw new HttpError(502, `Couldn't add ${name} to hosting: ${r.data?.error?.message || r.status}`);
    }
    if (!r.ok && r.status === 409 && r.data?.error?.code !== "domain_already_in_use_by_project") {
      throw new HttpError(409, `${name} is already connected to another site on our hosting. Remove it there first.`);
    }
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

async function status(prisma, store) {
  const domain = store.domain || null;
  const records = dnsRecords(domain);
  const [checks, live] = domain ? await Promise.all([Promise.all(records.map(checkRecord)), probeLive(domain, store.handle)]) : [[], false];
  const dnsOk = checks.length > 0 && checks.every((c) => c.ok);

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
    hosting: { managed: vercelOn() },
  };
}

async function connect(prisma, store, input) {
  const domain = normalizeDomain(input).replace(/^www\./, "");
  if (!DOMAIN_RE.test(domain)) throw new HttpError(400, "Enter a domain like shop.example.com or example.com.");
  const root = env.STOREFRONT_ROOT_DOMAIN;
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

module.exports = { status, connect, disconnect, normalizeDomain, isApex };
