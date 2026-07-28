/**
 * "how-to-negotiate-a-remote-offer" — clean and admin-controlled, unlike
 * Portfolio's makeSlug: a blog slug IS the SEO surface, so no random suffix
 * and no silent renaming on collision. Used both client-side (live slug
 * suggestion in the editor) and server-side (lib/blog/save.ts validation) —
 * kept dependency-free so importing it never pulls sanitize-html or Prisma
 * into the client bundle.
 */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "post"
  );
}
