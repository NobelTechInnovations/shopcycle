"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Select, Card, App } from "antd";
import { PageHeader, SaveBar, StatusBadge } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { ImageUploadField } from "@/components/ImageUploadField";
import { storefrontUrlFor } from "@/lib/storefront";

const SEO_TITLE_MAX = 70;
const SEO_DESCRIPTION_MAX = 160;

// <input type="datetime-local"> works in the browser's local time.
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BlogPostForm({ post, store }) {
  const storeUrl = storefrontUrlFor(store);
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const isEdit = Boolean(post);

  const initialValues = post
    ? {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        body: post.body,
        image: post.image || "",
        imageAlt: post.imageAlt,
        author: post.author,
        tags: post.tags,
        status: post.status,
        publishedAt: toLocalInput(post.publishedAt),
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
      }
    : { status: "draft", image: "" };

  const title = Form.useWatch("title", form);
  const slug = Form.useWatch("slug", form);
  const excerpt = Form.useWatch("excerpt", form);
  const seoTitle = Form.useWatch("seoTitle", form);
  const seoDescription = Form.useWatch("seoDescription", form);
  const status = Form.useWatch("status", form);
  const publishedAt = Form.useWatch("publishedAt", form);

  const previewPath = `/blog/${slug || post?.slug || "your-post"}`;
  const scheduled = status === "published" && publishedAt && new Date(publishedAt) > new Date();

  async function handleSubmit(values) {
    setSaving(true);
    try {
      const body = { ...values, publishedAt: values.publishedAt ? new Date(values.publishedAt).toISOString() : null };
      if (isEdit) {
        await apiFetch(`/api/blog/${post.id}`, { method: "PATCH", body });
        message.success("Post saved");
        setDirty(false);
        router.refresh();
      } else {
        const { article } = await apiFetch("/api/blog", { method: "POST", body });
        message.success(values.status === "published" ? "Post published" : "Draft saved");
        router.push(`/admin/content/blog/${article.id}`);
      }
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? post.title : "Write post"}
        backHref="/admin/content/blog"
        meta={isEdit ? <StatusBadge status={scheduled ? "scheduled" : post.status} /> : null}
      />

      <Form form={form} layout="vertical" initialValues={initialValues} onFinish={handleSubmit} onValuesChange={() => setDirty(true)} requiredMark={false}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
            <Card size="small">
              <Form.Item name="title" label="Title" rules={[{ required: true, message: "Give the post a title" }]}>
                <Input size="large" placeholder="How we source our turmeric" maxLength={200} />
              </Form.Item>
              <Form.Item
                name="body"
                label="Content"
                extra="Write in plain text — leave a blank line between paragraphs. HTML works too, for headings, links and lists."
              >
                <Input.TextArea rows={16} className="font-[inherit]" placeholder="Start writing…" />
              </Form.Item>
              <Form.Item name="excerpt" label="Excerpt" extra="The short summary on the blog page and home page. Leave empty to use the first lines of the post." className="mb-0">
                <Input.TextArea rows={2} maxLength={500} showCount />
              </Form.Item>
            </Card>

            <Card size="small" title="Search engine listing">
              <div className="rounded-lg border border-app-border bg-app-bg p-3 mb-4">
                <p className="m-0 text-xs text-ink-muted truncate">{(storeUrl || "").replace(/^https?:\/\//, "")}{previewPath}</p>
                <p className="m-0 text-[15px] text-[#1a0dab] truncate">{seoTitle || title || "Post title"}</p>
                <p className="m-0 text-[13px] text-ink-muted line-clamp-2">{seoDescription || excerpt || "A summary of the post will show here."}</p>
              </div>
              <Form.Item name="seoTitle" label="Page title">
                <Input maxLength={SEO_TITLE_MAX} showCount placeholder={title || ""} />
              </Form.Item>
              <Form.Item name="seoDescription" label="Meta description">
                <Input.TextArea rows={2} maxLength={SEO_DESCRIPTION_MAX} showCount placeholder={excerpt || ""} />
              </Form.Item>
              <Form.Item
                name="slug"
                label="URL handle"
                className="mb-0"
                rules={[{ pattern: /^[a-z0-9-]*$/, message: "Use lowercase letters, numbers and dashes" }]}
                extra={isEdit ? "Changing this breaks links people have already shared." : "Leave empty to make one from the title."}
              >
                <Input prefix={<span className="text-ink-muted">/blog/</span>} placeholder="how-we-source-our-turmeric" maxLength={120} />
              </Form.Item>
            </Card>
          </div>

          <div className="flex flex-col gap-6 min-w-0">
            <Card size="small" title="Visibility">
              <Form.Item name="status" className="mb-3">
                <Select
                  options={[
                    { value: "draft", label: "Draft — only you can see it" },
                    { value: "published", label: "Published" },
                  ]}
                />
              </Form.Item>
              {status === "published" && (
                <Form.Item name="publishedAt" label="Publish date" extra={scheduled ? "Goes live on this date." : "Leave empty to publish now."} className="mb-0">
                  <Input type="datetime-local" />
                </Form.Item>
              )}
            </Card>

            <Card size="small" title="Cover image">
              <Form.Item name="image" className="mb-3">
                <ImageUploadField aspect="16 / 10" />
              </Form.Item>
              <Form.Item name="imageAlt" label="Alt text" extra="Describe the image for people using screen readers." className="mb-0">
                <Input maxLength={200} />
              </Form.Item>
            </Card>

            <Card size="small" title="Organisation">
              <Form.Item name="author" label="Author">
                <Input maxLength={120} placeholder="Your name" />
              </Form.Item>
              <Form.Item name="tags" label="Tags" extra="Separate with commas — shoppers can browse posts by tag." className="mb-0">
                <Input maxLength={500} placeholder="Recipes, Behind the scenes" />
              </Form.Item>
            </Card>
          </div>
        </div>

        <SaveBar
          dirty={dirty}
          isNew={!isEdit}
          saving={saving}
          saveLabel={isEdit ? "Save" : status === "published" ? "Publish" : "Save draft"}
          onDiscard={() => (isEdit ? (form.resetFields(), setDirty(false)) : router.push("/admin/content/blog"))}
        />
      </Form>
    </div>
  );
}
