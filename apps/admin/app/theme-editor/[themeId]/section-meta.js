import {
  Image as ImageIcon,
  GalleryHorizontal,
  Megaphone,
  LayoutGrid,
  ShoppingBag,
  Star,
  Newspaper,
  Mail,
  Type,
  HelpCircle,
  Quote,
  Tag,
  Columns2,
  Sparkles,
  Award,
  Images,
  PanelTop,
  PanelBottom,
  MoveRight,
  Layers,
} from "lucide-react";

/** How each section type is described to a merchant in the editor — an
 * icon and one line on what it's for. Unknown types (a merchant's own
 * section from the code editor) fall back to a generic entry. */
const META = {
  hero: { icon: ImageIcon, group: "Banners", text: "A big photo with a headline and buttons — the first thing shoppers see." },
  slideshow: { icon: GalleryHorizontal, group: "Banners", text: "Several banners that rotate, each with its own heading and button." },
  "promo-banner": { icon: Tag, group: "Banners", text: "Sale or launch tiles with a photo, headline and link." },
  marquee: { icon: MoveRight, group: "Text", text: "A band of large scrolling text — offers, promises, press quotes." },
  "announcement-bar": { icon: Megaphone, group: "Layout", text: "A slim bar above the header for short messages." },
  "category-grid": { icon: LayoutGrid, group: "Products", text: "Tiles linking to your collections (shop by category)." },
  "collection-list": { icon: LayoutGrid, group: "Products", text: "Tiles linking to your collections (shop by category)." },
  "product-grid": { icon: ShoppingBag, group: "Products", text: "A row of products: new arrivals, best sellers or a collection." },
  "featured-collection": { icon: ShoppingBag, group: "Products", text: "A row of products: new arrivals, best sellers or a collection." },
  "collection-tabs": { icon: Layers, group: "Products", text: "Several collections in tabs — shoppers switch between them." },
  "featured-product": { icon: Sparkles, group: "Products", text: "One product in the spotlight, with add to cart right on the page." },
  "editorial-banner": { icon: Columns2, group: "Story", text: "A large photo beside your story, with optional figures." },
  "image-with-text": { icon: Columns2, group: "Story", text: "A photo beside a heading, text and button." },
  usp: { icon: Award, group: "Trust", text: "Why buy from you: delivery, returns, payment, support." },
  multicolumn: { icon: Award, group: "Trust", text: "Columns of icons or images with short text." },
  testimonials: { icon: Quote, group: "Trust", text: "Customer reviews with star ratings." },
  "logo-list": { icon: Star, group: "Trust", text: "Press or partner logos — \"as featured in\"." },
  "instagram-gallery": { icon: Images, group: "Story", text: "A grid of photos — Instagram, customer photos, a lookbook." },
  "image-gallery": { icon: Images, group: "Story", text: "A grid of photos — Instagram, customer photos, a lookbook." },
  faq: { icon: HelpCircle, group: "Text", text: "Questions and answers that open on click." },
  "featured-blog": { icon: Newspaper, group: "Story", text: "Your latest blog posts. Hidden until you publish one." },
  newsletter: { icon: Mail, group: "Text", text: "An email signup — signups become customers with consent." },
  "rich-text": { icon: Type, group: "Text", text: "A heading or statement with an optional button." },
  header: { icon: PanelTop, group: "Layout", text: "Logo, menu, search, account and cart." },
  footer: { icon: PanelBottom, group: "Layout", text: "Links, contact details, newsletter and social icons." },
};

export function sectionMeta(type) {
  return META[type] || { icon: Layers, group: "Other", text: "A custom section." };
}

export const GROUP_ORDER = ["Banners", "Products", "Story", "Trust", "Text", "Other"];
