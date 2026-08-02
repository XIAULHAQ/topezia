import type { Metadata } from "next";

/**
 * /crawler — the public page about TopeziaWidget.
 *
 * Every crawler that expects to be let through has one of these, and
 * Cloudflare's Verified Bots application asks for the URL. But the real
 * reason to write it carefully is the site owner who finds "TopeziaWidget"
 * in their access log at midnight and wants to know, in one screen, what it
 * is, whether they asked for it, and how to stop it. Everything here is
 * checkable against the behaviour — if the code changes, this page changes.
 */
export const metadata: Metadata = {
  title: "TopeziaWidget — our web crawler",
  description:
    "What the TopeziaWidget crawler does, when it visits, what it takes, and how to block it. It only reads websites whose owners have asked us to.",
  alternates: { canonical: "/crawler" },
};

const INK = "#0F172A";
const MUT = "#475569";
const LINE = "#E2E8F0";

const S = {
  page: { background: "#fff", color: INK, padding: "56px 20px 80px", minHeight: "100vh" } as const,
  shell: { maxWidth: 720, margin: "0 auto" } as const,
  h1: { fontSize: 32, fontWeight: 800, letterSpacing: "-0.8px", margin: "0 0 12px" } as const,
  lead: { fontSize: 16.5, lineHeight: 1.7, color: MUT, margin: "0 0 34px" } as const,
  h2: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px", margin: "34px 0 10px" } as const,
  p: { fontSize: 15, lineHeight: 1.75, color: MUT, margin: "0 0 12px" } as const,
  code: {
    background: "#F8FAFC",
    border: `1px solid ${LINE}`,
    borderRadius: 8,
    padding: "2px 7px",
    fontSize: 13.5,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    wordBreak: "break-all" as const,
  },
  pre: {
    background: "#F8FAFC",
    border: `1px solid ${LINE}`,
    borderRadius: 12,
    padding: "14px 16px",
    fontSize: 13,
    lineHeight: 1.65,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    overflowX: "auto" as const,
    margin: "0 0 12px",
  },
  li: { fontSize: 15, lineHeight: 1.75, color: MUT, marginBottom: 7 } as const,
};

export default function CrawlerPage() {
  return (
    <main style={S.page}>
      <div style={S.shell}>
        <h1 style={S.h1}>TopeziaWidget</h1>
        <p style={S.lead}>
          TopeziaWidget is the crawler behind Topezia&apos;s site chat. It reads a website so that the chat
          assistant on that same website can answer visitors&apos; questions from the site&apos;s own pages.
        </p>

        <h2 style={S.h2}>It only visits sites that asked for it</h2>
        <p style={S.p}>
          This is not a general web crawler. It never discovers sites on its own and never follows links off the
          site it was pointed at. It visits a website only after the owner of that website has signed in to
          Topezia and either typed their own domain in or installed our WordPress plugin on their own site.
        </p>
        <p style={S.p}>
          If TopeziaWidget is reading your site, someone with access to your Topezia account asked it to. If
          that wasn&apos;t you and you&apos;d like it to stop, the last section tells you how — and we&apos;d
          like to hear about it.
        </p>

        <h2 style={S.h2}>How to recognise it</h2>
        <p style={S.p}>Every request carries this user agent:</p>
        <pre style={S.pre}>TopeziaWidget/1.0 (+https://www.topezia.com)</pre>
        <p style={S.p}>
          A user agent string can be copied by anyone, so requests are also cryptographically signed using{" "}
          <a href="https://developers.cloudflare.com/bots/concepts/bot/verified-bots/" style={{ color: "#4F46E5" }}>
            Web Bot Auth
          </a>{" "}
          (HTTP Message Signatures, RFC 9421). Each request carries <code style={S.code}>Signature</code>,{" "}
          <code style={S.code}>Signature-Input</code> and <code style={S.code}>Signature-Agent</code> headers, and
          our public key is published at:
        </p>
        <pre style={S.pre}>https://www.topezia.com/.well-known/http-message-signatures-directory</pre>
        <p style={S.p}>
          That signature is what proves a request is genuinely ours. We don&apos;t publish an IP range, because
          we don&apos;t have dedicated addresses to publish — anything claiming to be TopeziaWidget from a
          particular IP is not something we can vouch for, but a valid signature is.
        </p>

        <h2 style={S.h2}>What it does</h2>
        <ul style={{ paddingLeft: 20, margin: "0 0 12px" }}>
          <li style={S.li}>
            Requests <code style={S.code}>/robots.txt</code> first, and obeys it. Rules addressed to{" "}
            <code style={S.code}>TopeziaWidget</code> take priority over <code style={S.code}>*</code>. Disallowed
            paths are never requested.
          </li>
          <li style={S.li}>
            Reads your sitemap if you have one, otherwise follows links from your homepage, one level deep.
          </li>
          <li style={S.li}>
            Fetches up to a few hundred pages, five at a time, and stops. A scan takes well under a minute on a
            typical site.
          </li>
          <li style={S.li}>
            Retries once, after a pause, on <code style={S.code}>429</code> or <code style={S.code}>503</code> —
            and only once.
          </li>
          <li style={S.li}>
            Requests GET only. It never submits forms, never signs in, and never touches anything behind a login.
          </li>
        </ul>

        <h2 style={S.h2}>When it visits</h2>
        <p style={S.p}>
          Only when there is a reason to: when a website is first connected, and when its owner presses re-scan.
          It does not poll, and it does not crawl on a schedule.
        </p>

        <h2 style={S.h2}>What it keeps</h2>
        <p style={S.p}>
          The readable text of your public pages, so the assistant can quote and link to them when answering a
          visitor. On a shop it also reads product names, prices and links, so it can point shoppers at the right
          product and hand them to your own checkout. Nothing is used to train models, and nothing is shared with
          anyone but the site&apos;s own Topezia account.
        </p>

        <h2 style={S.h2}>How to block it</h2>
        <p style={S.p}>Add this to your robots.txt and it will stop on the next scan:</p>
        <pre style={S.pre}>{`User-agent: TopeziaWidget\nDisallow: /`}</pre>
        <p style={S.p}>
          To remove the chat entirely, the site owner can turn it off in their Topezia dashboard, or delete the
          website from their account, which stops the crawler and deletes what it read.
        </p>

        <h2 style={S.h2}>Contact</h2>
        <p style={S.p}>
          Questions, or a crawl you didn&apos;t expect:{" "}
          <a href="mailto:hello@topezia.com" style={{ color: "#4F46E5" }}>
            hello@topezia.com
          </a>
          . We answer.
        </p>
      </div>
    </main>
  );
}
