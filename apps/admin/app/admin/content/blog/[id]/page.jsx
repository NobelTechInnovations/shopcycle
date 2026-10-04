import { serverApiFetch } from "@/lib/api";
import { BlogPostForm } from "../BlogPostForm";

export default async function EditBlogPostPage({ params }) {
  const { id } = await params;
  const [{ article }, { store }] = await Promise.all([serverApiFetch(`/api/blog/${id}`), serverApiFetch("/api/store")]);
  return <BlogPostForm post={article} store={store} />;
}
