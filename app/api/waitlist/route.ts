/**
 * Topezia founding-employer waitlist — public submission endpoint.
 *
 * POST /api/waitlist
 * body: { companyName, contactName, email, phone?, careersPageUrl,
 *         hiringVolume?, verticalSlug? }
 *
 * Two things happen on every valid submission (spec §8):
 *   1. A WaitlistSignup row is created — this is what the admin CMS reads.
 *   2. A Source row is created from the careers page URL, flagged
 *      isPriority — this is what feeds Slice 2 ingestion. The waitlist
 *      form is a lead capture AND a supply pipeline in one submit.
 *
 * The "first 100" cap is enforced HERE, server-side — not just in the
 * landing page copy. Submissions past 100 still save (never lose a lead)
 * but isFoundingMember is false and foundingRank is null.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const FOUNDING_MEMBER_CAP = 100;

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { companyName, contactName, email, phone, careersPageUrl, hiringVolume, verticalSlug } = body;

  if (!companyName || !contactName || !email || !careersPageUrl) {
    return NextResponse.json(
      { error: "companyName, contactName, email, and careersPageUrl are required" },
      { status: 400 }
    );
  }

  if (!isValidUrl(careersPageUrl)) {
    return NextResponse.json({ error: "careersPageUrl must be a valid URL" }, { status: 400 });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return NextResponse.json({ error: "email is not valid" }, { status: 400 });
  }

  // Cap check — count existing founding members, not total signups, so a
  // later manual disqualification doesn't silently reopen slots incorrectly.
  const foundingCount = await prisma.waitlistSignup.count({
    where: { isFoundingMember: true },
  });

  const grantsFoundingStatus = foundingCount < FOUNDING_MEMBER_CAP;

  // Create (or reuse) the ingestion Source from the careers page domain.
  const domain = new URL(careersPageUrl).hostname.replace(/^www\./, "");
  const source = await prisma.source.upsert({
    where: {
      // JOBPOSTING_SCHEMA is the right default source type for a raw
      // careers-page URL — the crawler decides at index time whether it's
      // actually an ATS board it can hit more directly (§4.1).
      type_companySlug: { type: "JOBPOSTING_SCHEMA", companySlug: domain },
    },
    update: { isPriority: true, careersPageUrl },
    create: {
      type: "JOBPOSTING_SCHEMA",
      companySlug: domain,
      careersPageUrl,
      isPriority: true,
    },
  });

  const signup = await prisma.waitlistSignup.create({
    data: {
      companyName,
      contactName,
      email,
      phone: phone || null,
      careersPageUrl,
      hiringVolume: hiringVolume || null,
      verticalSlug: verticalSlug || null,
      isFoundingMember: grantsFoundingStatus,
      foundingRank: grantsFoundingStatus ? foundingCount + 1 : null,
      sourceId: source.id,
    },
  });

  return NextResponse.json(
    {
      success: true,
      isFoundingMember: signup.isFoundingMember,
      foundingRank: signup.foundingRank,
    },
    { status: 201 }
  );
}
