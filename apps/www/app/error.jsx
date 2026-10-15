"use client";

import Link from "next/link";
import { Icon, I } from "./components/Icon";

/** Anything that breaks while a page renders: say so plainly, offer a retry. */
export default function Error({ reset }) {
  return (
    <section className="error-page">
      <div className="wrap">
        <span className="icon-tile"><Icon d={I.refresh} /></span>
        <p className="error-page__code">Something went wrong</p>
        <h1 className="h1">This page didn&apos;t load.</h1>
        <p className="lead">It&apos;s on our side, not yours. Try again — if it keeps happening, the rest of the site still works.</p>
        <div className="hero__ctas">
          <button type="button" className="btn btn--primary btn--lg" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/" className="btn btn--ghost btn--lg">Go to the home page</Link>
        </div>
      </div>
    </section>
  );
}
