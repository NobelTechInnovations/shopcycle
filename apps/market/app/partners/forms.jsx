"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { signUp, signIn, saveProfile, createListing, saveListing, submitListing, rotateSecret, revealSecret } from "./actions";
import { CATEGORY_LABELS } from "@/lib/config";

function Submit({ children, className = "btn btn--primary", pending: label = "Working…" }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending ? label : children}
    </button>
  );
}

function Message({ state }) {
  if (!state) return null;
  if (state.error)
    return (
      <div className="alert alert--error" role="alert">
        {state.error}
        {state.details?.length > 1 && (
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {state.details.slice(0, 12).map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </div>
    );
  if (state.ok) return <div className="alert alert--ok">{state.ok}</div>;
  return null;
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, null);
  return (
    <form action={action} className="form">
      <Message state={state} />
      <label className="field">
        <span>Your name</span>
        <input className="input" name="name" required autoComplete="name" />
      </label>
      <label className="field">
        <span>Company or studio (optional)</span>
        <input className="input" name="company" autoComplete="organization" />
      </label>
      <label className="field">
        <span>Email</span>
        <input className="input" name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" name="password" type="password" minLength={8} required autoComplete="new-password" />
        <small>At least 8 characters.</small>
      </label>
      <Submit className="btn btn--accent btn--lg btn--block" pending="Creating your account…">
        Create developer account
      </Submit>
    </form>
  );
}

export function SignInForm({ next }) {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="form">
      <Message state={state} />
      <input type="hidden" name="next" value={next || ""} />
      <label className="field">
        <span>Email</span>
        <input className="input" name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" name="password" type="password" required autoComplete="current-password" />
      </label>
      <Submit className="btn btn--accent btn--lg btn--block" pending="Signing in…">
        Sign in
      </Submit>
    </form>
  );
}

export function ProfileForm({ partner }) {
  const [state, action] = useActionState(saveProfile, null);
  return (
    <form action={action} className="form">
      <Message state={state} />
      <div className="two">
        <label className="field">
          <span>Name</span>
          <input className="input" name="name" defaultValue={partner.name} required />
        </label>
        <label className="field">
          <span>Company or studio</span>
          <input className="input" name="company" defaultValue={partner.company || ""} />
        </label>
      </div>
      <label className="field">
        <span>Website</span>
        <input className="input" name="website" type="url" defaultValue={partner.website || ""} placeholder="https://" />
        <small>Shown as “By …” on your listings.</small>
      </label>
      <div className="two">
        <label className="field">
          <span>Payout UPI ID</span>
          <input className="input" name="payoutUpi" defaultValue={partner.payoutUpi || ""} placeholder="you@okhdfcbank" />
          <small>Your earnings are paid here. Needed before a paid listing goes for review.</small>
        </label>
        <label className="field">
          <span>Name on the UPI account</span>
          <input className="input" name="payoutName" defaultValue={partner.payoutName || ""} />
        </label>
      </div>
      <div>
        <Submit pending="Saving…">Save</Submit>
      </div>
    </form>
  );
}

/** An icon or screenshots: uploaded straight away, kept as ids in the form. */
function ImagesField({ name, label, hint, initial = [], multiple }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function add(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const added = [];
      for (const file of files.slice(0, multiple ? 10 : 1)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/partner/media", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload failed");
        added.push(data);
      }
      setItems((cur) => (multiple ? [...cur, ...added].slice(0, 10) : added.slice(0, 1)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="field">
      <span>{label}</span>
      {hint && <small>{hint}</small>}
      <div className="row" style={{ alignItems: "flex-start" }}>
        {items.map((m, i) => (
          <div key={m.id} style={{ position: "relative" }}>
            <img src={m.url} alt="" style={{ width: multiple ? 150 : 64, height: multiple ? 94 : 64, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)" }} />
            <input type="hidden" name={name} value={m.id} />
            <button type="button" className="btn btn--sm" style={{ position: "absolute", top: 4, right: 4, height: 24, padding: "0 8px" }} onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label="Remove image">
              ✕
            </button>
          </div>
        ))}
        {(multiple ? items.length < 10 : items.length === 0) && (
          <label className="btn" style={{ height: multiple ? 94 : 64, width: multiple ? 150 : 64, borderStyle: "dashed" }}>
            {busy ? "…" : "+ Add"}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple={multiple} onChange={add} className="sr-only" />
          </label>
        )}
      </div>
      {error && <small style={{ color: "var(--red)" }}>{error}</small>}
    </div>
  );
}

export function ListingForm({ listing, kind: newKind, categories, scopes }) {
  const isNew = !listing;
  const kind = listing?.kind || newKind;
  const [state, action] = useActionState(isNew ? createListing : saveListing, null);
  const cats = categories[kind] || [];
  return (
    <form action={action} className="form">
      <Message state={state} />
      {isNew ? <input type="hidden" name="kind" value={kind} /> : <input type="hidden" name="id" value={listing.id} />}
      <div className="two">
        <label className="field">
          <span>Name</span>
          <input className="input" name="name" defaultValue={listing?.name || ""} required maxLength={60} />
        </label>
        <label className="field">
          <span>Category</span>
          <select className="select" name="category" defaultValue={listing?.category || cats[0]}>
            {cats.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] || c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>One line about it</span>
        <input className="input" name="tagline" defaultValue={listing?.tagline || ""} maxLength={120} placeholder={kind === "theme" ? "A bold, fast theme for snack and sweet shops" : "Collect reviews by WhatsApp after delivery"} />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea className="textarea" name="description" defaultValue={listing?.description || ""} maxLength={8000} placeholder="What it does, who it's for, what's included…" />
        <small>At least 80 characters before review.</small>
      </label>
      <label className="field" style={{ maxWidth: 260 }}>
        <span>{kind === "theme" ? "Price (one-time, ₹)" : "Price (a month, ₹)"}</span>
        <input className="input" name="price" type="number" min="0" step="1" defaultValue={listing?.price || 0} />
        <small>0 = free. Paid: at least ₹99, before GST.</small>
      </label>
      <ImagesField name="iconId" label="Icon" hint="Square, at least 256 × 256." initial={listing?.icon ? [{ id: listing.iconId, url: listing.icon }] : []} />
      <ImagesField
        name="screenshots"
        label="Screenshots"
        hint={kind === "theme" ? "The first one is the cover — a desktop home page, 1600 × 1000 works well." : "Show the app in use."}
        initial={(listing?.screenshotIds || []).map((id, i) => ({ id, url: listing.screenshots[i] }))}
        multiple
      />
      {kind === "app" && (
        <>
          <h3 style={{ marginTop: 8 }}>How it connects</h3>
          <label className="field">
            <span>App link</span>
            <input className="input" name="appUrl" type="url" defaultValue={listing?.appUrl || ""} placeholder="https://yourapp.com/oyklane" />
            <small>Where sellers open your app — we add ?store=…&ts=…&signature=… so you know which store it is.</small>
          </label>
          <label className="field">
            <span>Install webhook</span>
            <input className="input" name="installWebhook" type="url" defaultValue={listing?.installWebhook || ""} placeholder="https://yourapp.com/oyklane/webhook" />
            <small>We POST app.installed (with the store's API key) and app.uninstalled here, signed with your app secret.</small>
          </label>
          <label className="field">
            <span>Storefront script (optional)</span>
            <input className="input" name="embedScriptUrl" type="url" defaultValue={listing?.embedScriptUrl || ""} placeholder="https://cdn.yourapp.com/widget.js" />
            <small>Added to every page of stores that install the app (never to checkout).</small>
          </label>
          <div className="field">
            <span>What it needs access to</span>
            <div className="checks">
              {scopes.map((s) => (
                <label key={s.key}>
                  <input type="checkbox" name="scopes" value={s.key} defaultChecked={listing?.scopes?.includes(s.key)} /> {s.label}
                </label>
              ))}
            </div>
          </div>
          <div className="two">
            <label className="field">
              <span>Support email</span>
              <input className="input" name="supportEmail" type="email" defaultValue={listing?.supportEmail || ""} />
            </label>
            <label className="field">
              <span>Privacy policy link</span>
              <input className="input" name="privacyUrl" type="url" defaultValue={listing?.privacyUrl || ""} />
            </label>
          </div>
        </>
      )}
      <div>
        <Submit pending="Saving…">{isNew ? "Create listing" : "Save"}</Submit>
      </div>
    </form>
  );
}

export function VersionUpload({ listingId, kind, nextVersion }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function upload(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/partner/listings/${listingId}/versions`, { method: "POST", body: new FormData(form) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || "Upload failed"), { details: data.details });
      setMsg({ ok: kind === "theme" ? `Version ${data.version.version} uploaded — ${data.version.files} files. Preview it below, then send it for review.` : `Release ${data.version.version} added.` });
      form.reset();
      router.refresh();
    } catch (err) {
      setMsg({ error: err.message, details: err.details });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={upload} className="form">
      <Message state={msg} />
      <div className="two">
        <label className="field">
          <span>Version</span>
          <input className="input" name="version" defaultValue={nextVersion} pattern="\d+\.\d+\.\d+" required />
        </label>
        {kind === "theme" && (
          <label className="field">
            <span>Theme .zip</span>
            <input className="input" name="file" type="file" accept=".zip,application/zip" required />
          </label>
        )}
      </div>
      <label className="field">
        <span>What's new</span>
        <textarea className="textarea" name="changelog" style={{ minHeight: 80 }} placeholder="New mega menu, faster product page…" />
      </label>
      <div>
        <button className="btn btn--primary" disabled={busy}>
          {busy ? "Uploading and checking…" : kind === "theme" ? "Upload version" : "Add release"}
        </button>
      </div>
    </form>
  );
}

export function SubmitForReview({ id, disabled }) {
  const [state, action] = useActionState(submitListing, null);
  return (
    <form action={action} className="stack">
      <Message state={state} />
      <input type="hidden" name="id" value={id} />
      <Submit className="btn btn--accent" pending="Sending…">
        {disabled ? "Send the new version for review" : "Send for review"}
      </Submit>
    </form>
  );
}

export function SecretBox({ id }) {
  const [shown, show] = useActionState(revealSecret, null);
  const [rotated, rotate] = useActionState(rotateSecret, null);
  const secret = rotated?.secret || shown?.secret;
  return (
    <div className="stack">
      <p className="small muted">Signs install webhooks (X-Oyklane-Signature: HMAC-SHA256 of the body, hex) and app links (signature over store=…&ts=…). Keep it on your server.</p>
      {secret ? <pre style={{ margin: 0 }}>{secret}</pre> : null}
      <div className="row">
        {!secret && (
          <form action={show}>
            <input type="hidden" name="id" value={id} />
            <Submit className="btn btn--sm">Show secret</Submit>
          </form>
        )}
        <form action={rotate}>
          <input type="hidden" name="id" value={id} />
          <Submit className="btn btn--sm" pending="…">
            Make a new secret
          </Submit>
        </form>
      </div>
    </div>
  );
}
