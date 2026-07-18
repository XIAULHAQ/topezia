-- Split "Marketing & Creative" into "Marketing" and "Design & Creative".
--
-- The combined vertical lumped brand/social/content/SEO marketing together with
-- product/graphic/video DESIGN, so a marketing manager's insight stats were
-- measured partly against designers (Figma, prototyping) — wrong for both sides.
-- Splitting makes each measured against its own field. The marketing half keeps
-- the existing vertical row (so its jobs/roles stay put); design moves out.

-- New vertical for the design/creative half.
INSERT INTO "Vertical" (id, slug, name, "isDeepTier", "cardLayout", "createdAt")
VALUES (gen_random_uuid(), 'design-creative', 'Design & Creative', false, 'KNOWLEDGE_WORK'::"CardLayout", NOW());

-- Rename the existing vertical to Marketing (keeps its id → marketing jobs/roles unaffected).
UPDATE "Vertical" SET slug = 'marketing', name = 'Marketing' WHERE slug = 'marketing-creative';

-- Move the design roles to the new vertical.
UPDATE "Role" SET "verticalId" = (SELECT id FROM "Vertical" WHERE slug = 'design-creative')
WHERE slug IN ('graphic-designer', 'video-editor', 'product-designer');

-- Re-file every job whose role is a design role into the design vertical.
-- Jobs with a marketing role or no role stay in Marketing (unchanged).
UPDATE "Job" SET "verticalId" = (SELECT id FROM "Vertical" WHERE slug = 'design-creative')
WHERE "roleId" IN (SELECT id FROM "Role" WHERE slug IN ('graphic-designer', 'video-editor', 'product-designer'));
