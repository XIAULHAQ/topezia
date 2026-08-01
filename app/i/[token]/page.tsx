import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import ThreadClient from "./thread-client";

/**
 * An anonymous widget visitor's view of their conversation with a company.
 *
 * The token IS the authorization — it was only ever sent to the email the
 * visitor left, so holding the link proves the mailbox is theirs (same
 * posture as testimonial invites). No account, no login, noindex.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your conversation — Topezia",
  robots: { index: false, follow: false, nocache: true },
};

export default async function VisitorThreadPage({ params }: { params: { token: string } }) {
  const inquiry = await prisma.companyInquiry.findUnique({
    where: { threadToken: params.token },
    select: {
      id: true, message: true, status: true, repliedAt: true, createdAt: true,
      company: { select: { name: true, slug: true } },
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, sender: true, body: true, createdAt: true } },
    },
  });

  if (!inquiry) {
    return (
      <main style={{ fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif", maxWidth: 560, margin: "0 auto", padding: "60px 20px", color: "#334155" }}>
        <h1 style={{ fontSize: 20 }}>This conversation doesn&apos;t exist anymore.</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "#64748B" }}>The link may be old, or the message was removed.</p>
      </main>
    );
  }

  return (
    <ThreadClient
      token={params.token}
      companyName={inquiry.company.name}
      firstMessage={inquiry.message}
      sentAt={inquiry.createdAt.toISOString()}
      open={inquiry.status === "REPLIED"}
      messages={inquiry.messages.map((m) => ({ id: m.id, sender: m.sender, body: m.body, at: m.createdAt.toISOString() }))}
    />
  );
}
