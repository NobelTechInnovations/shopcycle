"use client";

import { Tag } from "lucide-react";
import { TaxonomyList } from "@/components/TaxonomyList";

export default function BrandsPage() {
  return (
    <TaxonomyList
      resource="brands"
      singular="Brand"
      plural="Brands"
      basePath="/admin/products/brands"
      icon={Tag}
      description="Add the brands you sell so shoppers can browse and filter by them."
    />
  );
}
