-- 076_many_companies_per_account — one account may own several companies.
--
-- HAND-WRITTEN, applied with `prisma db execute` and recorded with
-- `prisma migrate resolve --applied`. Do NOT regenerate with
-- `prisma migrate diff` (pgvector drift trap, same as 044-075).
--
-- WHY. Company.ownerUserId was UNIQUE since 032: "one company per account" was
-- the schema's way of making "my company" unambiguous. Brandon runs more than
-- one business from one login, and the person who set up the first company is
-- exactly the person who sets up the second — so the constraint blocked the
-- real user, not an abuse case.
--
-- What replaces the ambiguity: an "active company" cookie, read by
-- lib/company/active.ts, which every "my company" lookup now goes through. The
-- schema still says who OWNS a company (ownerUserId); it just no longer says
-- there is only one.
--
-- Nothing else changes shape: billing, widget sites, team, inquiries were all
-- already keyed on Company.id, not on the owner. Postings already carried an
-- optional companyId — an individual could always post under their own name —
-- so "post as yourself or as one of your companies" is a picker, not a table.

ALTER TABLE "Company" DROP CONSTRAINT "Company_ownerUserId_key";
CREATE INDEX "Company_ownerUserId_idx" ON "Company"("ownerUserId");
