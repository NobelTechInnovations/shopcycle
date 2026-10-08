import { Browse } from "../components/Browse";

export const metadata = { title: "Search" };

export default function SearchPage({ searchParams }) {
  return <Browse base="/search" searchParams={searchParams} title="Search" />;
}
