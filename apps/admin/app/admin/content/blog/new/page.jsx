import { serverApiFetch } from "@/lib/api";
import { BlogPostForm } from "../BlogPostForm";

export default async function NewBlogPostPage() {
  const { store } = await serverApiFetch("/api/store");
  return <BlogPostForm store={store} />;
}
