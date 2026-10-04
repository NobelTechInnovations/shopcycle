"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Skeleton } from "antd";
import { BookOpen, Sparkles, ThumbsDown, ThumbsUp, Ticket } from "lucide-react";
import { PageHeader, EmptyState, Markdown } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { useHelp } from "@/components/help/HelpDrawer";

export default function HelpArticlePage({ params }) {
  const { slug } = use(params);
  const router = useRouter();
  const { openHelp } = useHelp();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [voted, setVoted] = useState(null);

  useEffect(() => {
    setData(null);
    setVoted(null);
    apiFetch(`/api/support/articles/${slug}`)
      .then(setData)
      .catch(() => setMissing(true));
  }, [slug]);

  async function vote(helpful) {
    setVoted(helpful ? "yes" : "no");
    apiFetch(`/api/support/articles/${slug}/feedback`, { method: "POST", body: { helpful } }).catch(() => {});
  }

  if (missing) return <EmptyState icon={<BookOpen />} title="Article not found" description="It may have moved." actionLabel="Help centre" onAction={() => router.push("/admin/support")} />;
  if (!data) return <Skeleton active paragraph={{ rows: 10 }} />;
  const { article, related } = data;

  return (
    <div className="max-w-3xl">
      <PageHeader backHref="/admin/support" breadcrumb="Help centre" title={article.title} />
      <article className="bg-app-surface border border-app-border rounded-[16px] shadow-card px-6 py-6 sm:px-8 sm:py-7">
        <Markdown text={article.body} className="text-[15px] [&>*+*]:mt-3.5" />
        <div className="mt-8 pt-5 border-t border-app-border flex flex-wrap items-center gap-2">
          {voted ? (
            <p className="m-0 text-[13px] text-ink-muted">{voted === "yes" ? "Thanks — glad it helped." : "Thanks for telling us. Want a person to look at it?"}</p>
          ) : (
            <>
              <span className="text-[13px] text-ink-muted mr-1">Was this helpful?</span>
              <Button size="small" icon={<ThumbsUp size={13} aria-hidden="true" />} onClick={() => vote(true)}>
                Yes
              </Button>
              <Button size="small" icon={<ThumbsDown size={13} aria-hidden="true" />} onClick={() => vote(false)}>
                No
              </Button>
            </>
          )}
          {voted === "no" && (
            <Button size="small" type="primary" ghost icon={<Ticket size={13} aria-hidden="true" />} onClick={() => openHelp({ ticket: { subject: `About “${article.title}”` } })}>
              Contact the team
            </Button>
          )}
        </div>
      </article>

      <div className="grid gap-4 sm:grid-cols-2 mt-5">
        {related.length > 0 && (
          <section className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-4">
            <h2 className="m-0 mb-2 text-[14px] font-semibold text-ink">Related guides</h2>
            <ul className="list-none m-0 p-0">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/admin/support/articles/${r.slug}`} className="block py-1.5 text-[13.5px] text-ink-muted no-underline hover:text-ink">
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-4">
          <h2 className="m-0 mb-1 text-[14px] font-semibold text-ink">Still stuck?</h2>
          <p className="text-[13px] text-ink-muted mt-0 mb-3">Ask about your exact situation — the assistant knows your store's setup.</p>
          <Button type="primary" icon={<Sparkles size={14} aria-hidden="true" />} onClick={() => openHelp()}>
            Ask the assistant
          </Button>
        </section>
      </div>
    </div>
  );
}
