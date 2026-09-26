"use client";

import { Grid3x3 } from "lucide-react";
import { TaxonomyList } from "@/components/TaxonomyList";

export default function CategoriesPage() {
  return (
    <TaxonomyList
      resource="categories"
      singular="Category"
      plural="Categories"
      basePath="/admin/products/categories"
      icon={Grid3x3}
      description="Organize your catalog into categories like Tops, Spices, or Accessories."
    />
  );
}
