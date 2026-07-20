/**
 * Portfolio categories, in the two groups they're presented in.
 *
 * The enum values are the contract with the database; the labels are display
 * text and can be reworded without a migration.
 */

export const PORTFOLIO_CATEGORIES = [
  { value: "BRANDING_IDENTITY", label: "Branding & Identity", group: "Marketing & Creative" },
  { value: "GRAPHIC_DESIGN", label: "Graphic Design", group: "Marketing & Creative" },
  { value: "ILLUSTRATION", label: "Illustration", group: "Marketing & Creative" },
  { value: "PHOTOGRAPHY", label: "Photography", group: "Marketing & Creative" },
  { value: "VIDEO_MOTION", label: "Video & Motion", group: "Marketing & Creative" },
  { value: "UI_UX_DESIGN", label: "UI/UX Design", group: "Marketing & Creative" },
  { value: "SOCIAL_CONTENT", label: "Social Media & Content", group: "Marketing & Creative" },
  { value: "COPYWRITING", label: "Copywriting", group: "Marketing & Creative" },
  { value: "WEB_APPLICATION", label: "Web Application", group: "Tech & Software" },
  { value: "MOBILE_APP", label: "Mobile App", group: "Tech & Software" },
  { value: "API_BACKEND", label: "API / Backend System", group: "Tech & Software" },
  { value: "OPEN_SOURCE", label: "Open Source Contribution", group: "Tech & Software" },
  { value: "DATA_ML", label: "Data / ML Project", group: "Tech & Software" },
  { value: "DEVOPS_INFRA", label: "DevOps / Infrastructure", group: "Tech & Software" },
  { value: "TECHNICAL_WRITING", label: "Technical Writing", group: "Tech & Software" },
] as const;

export type PortfolioCategoryValue = (typeof PORTFOLIO_CATEGORIES)[number]["value"];

const BY_VALUE = new Map(PORTFOLIO_CATEGORIES.map((c) => [c.value, c]));

export const categoryLabel = (v: string): string => BY_VALUE.get(v as PortfolioCategoryValue)?.label ?? v;

/** Narrow untrusted input to a real category, or null. */
export function parseCategory(v: unknown): PortfolioCategoryValue | null {
  return typeof v === "string" && BY_VALUE.has(v as PortfolioCategoryValue) ? (v as PortfolioCategoryValue) : null;
}

export const CATEGORY_GROUPS = ["Marketing & Creative", "Tech & Software"] as const;

/** URL-safe slug for a category filter, e.g. "ui-ux-design". */
export const categorySlug = (v: string) => v.toLowerCase().replace(/_/g, "-");

export function categoryFromSlug(slug: string): PortfolioCategoryValue | null {
  const v = slug.toUpperCase().replace(/-/g, "_");
  return parseCategory(v);
}
