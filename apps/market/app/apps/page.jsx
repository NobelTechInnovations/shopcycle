import { Browse } from "../components/Browse";

export const metadata = { title: "Apps", description: "Apps for Oyklane stores — marketing, reviews, shipping, payments and more." };

export default function AppsPage({ searchParams }) {
  return <Browse kind="app" base="/apps" searchParams={searchParams} title="Apps" intro="Add what your store needs. Paid apps are billed monthly with your Oyklane plan." />;
}
