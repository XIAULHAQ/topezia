import type { CSSProperties, ReactNode } from "react";

/**
 * The product, drawn.
 *
 * These are RECREATIONS of the real surfaces, not photographs — built from the
 * same style values as app/widget/[token]/widget-chat.tsx and the lead email in
 * lib/company/inquiries.ts, so they stay true to what a visitor actually sees.
 * The shop is invented on purpose: a marketing page must never put a real
 * customer's brand, orders or enquiries on display without their say-so.
 *
 * They are also lighter and sharper than screenshots — real text, so it scales,
 * reflows on a phone, and can be read by a screen reader.
 */

const GRAD = "linear-gradient(135deg,#8B5CF6,#3B82F6)";

/** The chat frame: header, scroll area, composer. */
export function ChatFrame({ children, sub = "usually replies within an hour" }: { children: ReactNode; sub?: string }) {
  return (
    <div style={{
      width: "100%", maxWidth: 380, background: "#fff", border: "1px solid #E2E8F0",
      borderRadius: 18, boxShadow: "0 18px 44px rgba(15,23,42,.13)", overflow: "hidden",
      fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif",
    }}>
      <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          flex: "none", width: 36, height: 36, borderRadius: "50%", background: GRAD,
          display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 13,
        }}>HP</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0F172A" }}>Harbour &amp; Pine</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>{sub}</div>
        </div>
        <div aria-hidden style={{
          flex: "none", width: 34, height: 34, borderRadius: 10, border: "1px solid #E2E8F0",
          display: "grid", placeItems: "center", color: "#64748B", fontSize: 15,
        }}>✕</div>
      </div>
      <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
        {children}
      </div>
      <div style={{ display: "flex", gap: 8, padding: "10px 12px 12px", borderTop: "1px solid #E2E8F0" }}>
        <div style={{
          flex: 1, border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 11px",
          fontSize: 13, color: "#94A3B8", background: "#fff",
        }}>Ask a question…</div>
        {/* The real mic, not an emoji: the widget draws this exact path, and
            an emoji renders differently on every platform. */}
        <div aria-hidden style={{
          flex: "none", width: 38, borderRadius: 10, border: "1px solid #E2E8F0",
          display: "grid", placeItems: "center", color: "#64748B",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="9" y="2" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </div>
        <div aria-hidden style={{
          background: GRAD, color: "#fff", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700,
        }}>→</div>
      </div>
    </div>
  );
}

const bubble: CSSProperties = { maxWidth: "88%", fontSize: 13.5, lineHeight: 1.55, borderRadius: 14, padding: "9px 13px", whiteSpace: "pre-wrap" };

export function Bot({ children }: { children: ReactNode }) {
  return <div style={{ ...bubble, alignSelf: "flex-start", background: "#F1F5F9", color: "#0F172A", borderBottomLeftRadius: 4 }}>{children}</div>;
}

export function Visitor({ children }: { children: ReactNode }) {
  return <div style={{ ...bubble, alignSelf: "flex-end", background: GRAD, color: "#fff", borderBottomRightRadius: 4 }}>{children}</div>;
}

/** The page the answer came from, as the chat shows it. */
export function Source({ label }: { label: string }) {
  return (
    <span style={{ display: "flex", gap: 8, marginTop: -2 }}>
      <span style={{ fontSize: 11, color: "#4F46E5", fontWeight: 700, background: "#EEF2FF", borderRadius: 999, padding: "2px 9px" }}>{label}</span>
    </span>
  );
}

/** A product card with the buy buttons that go straight to the shop's checkout. */
export function ProductCard({ name, price, options }: { name: string; price: string; options: string[] }) {
  return (
    <div style={{ marginTop: 2 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E2E8F0",
        borderRadius: 12, padding: "9px 11px", boxShadow: "0 1px 3px rgba(15,23,42,.06)",
      }}>
        <div aria-hidden style={{ flex: "none", width: 44, height: 44, borderRadius: 8, background: "#EEF2FF", display: "grid", placeItems: "center", fontSize: 18 }}>🪑</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 12.8, fontWeight: 700, lineHeight: 1.35 }}>{name}</span>
          <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#4F46E5", marginTop: 2 }}>{price}</span>
        </div>
        <span style={{ flex: "none", fontSize: 11.5, fontWeight: 700, color: "#4F46E5" }}>View →</span>
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
        {options.map((o) => (
          <span key={o} style={{ background: GRAD, color: "#fff", borderRadius: 999, padding: "8px 14px", fontSize: 12.3, fontWeight: 700 }}>{o}</span>
        ))}
      </div>
    </div>
  );
}

/** The "who am I talking to?" card, exactly as it appears after the first answer. */
export function ContactCard() {
  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#F8FAFC" }}>
      <b style={{ fontSize: 13 }}>Who am I talking to?</b>
      <span style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.5 }}>
        So the team can follow up if we get cut off. We&apos;ll only use it to reply.
      </span>
      {["Your name (optional)", "Email — the reply goes here", "Phone (optional)"].map((p) => (
        <div key={p} style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 11px", fontSize: 13, color: "#94A3B8", background: "#fff" }}>{p}</div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <span style={{ background: GRAD, color: "#fff", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700 }}>Save my details</span>
        <span style={{ background: "#fff", color: "#334155", border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 700 }}>Not now</span>
      </div>
    </div>
  );
}

/** The email that reaches the owner — message, contact, brief, whole chat. */
export function LeadEmail() {
  const label: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".02em", textTransform: "uppercase", margin: "0 0 3px" };
  const turn = (who: string, text: string, visitor: boolean) => (
    <div key={who + text} style={{ margin: "0 0 10px" }}>
      <div style={{ ...label, color: visitor ? "#4F46E5" : "#94A3B8" }}>{who}</div>
      <div style={{
        color: "#334155", fontSize: 13, lineHeight: 1.55, background: visitor ? "#F5F3FF" : "#F8FAFC",
        borderRadius: 10, padding: "9px 12px", whiteSpace: "pre-wrap",
      }}>{text}</div>
    </div>
  );
  return (
    <div style={{
      background: "#fff", border: "1px solid #ECECF2", borderRadius: 16, padding: 22,
      fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif", boxShadow: "0 18px 44px rgba(15,23,42,.10)",
    }}>
      <div style={{ fontWeight: 800, fontSize: 18, color: "#4F46E5", marginBottom: 16 }}>topezia</div>
      <h3 style={{ fontSize: 17, margin: "0 0 8px", color: "#1a1a2e" }}>New message in your company inbox</h3>
      <p style={{ color: "#6b7280", fontSize: 13.5, lineHeight: 1.55, margin: "0 0 12px" }}>
        Dana Whitfield wrote to Harbour &amp; Pine about <strong>Website chat</strong>:
      </p>
      <div style={{
        color: "#334155", fontSize: 13.5, lineHeight: 1.6, margin: "0 0 14px",
        borderLeft: "3px solid #e5e7eb", paddingLeft: 12, whiteSpace: "pre-wrap",
      }}>{"do you make the oak dining table in a 2.4m length?\n\nwe're doing a long farmhouse table for a barn conversion, seats ten"}</div>
      <p style={{ margin: "0 0 14px", color: "#334155", fontSize: 13.5 }}>
        Reach them: <span style={{ color: "#4F46E5", fontWeight: 600 }}>dana@example.com</span> · <span style={{ color: "#4F46E5", fontWeight: 600 }}>0161 496 0142</span>
      </p>
      <div style={{ background: "#fbfbfe", border: "1px solid #ececf2", borderRadius: 12, padding: "14px 16px", margin: "0 0 16px" }}>
        <div style={{ ...label, color: "#6b7280", marginBottom: 8 }}>What they&apos;re after</div>
        <p style={{ margin: "0 0 8px", color: "#1a1a2e", fontSize: 13.5, lineHeight: 1.5, fontWeight: 600 }}>
          Oak dining table in a non-standard 2.4m length for a barn conversion, seating ten.
        </p>
        <p style={{ margin: "0 0 5px", color: "#334155", fontSize: 12.5 }}><span style={{ color: "#6b7280" }}>Wants:</span> 2.4m oak table, seats ten</p>
        <p style={{ margin: "0 0 5px", color: "#334155", fontSize: 12.5 }}><span style={{ color: "#6b7280" }}>Timing:</span> before the end of October</p>
        <p style={{ margin: 0, color: "#334155", fontSize: 12.5 }}><span style={{ color: "#6b7280" }}>Still to ask:</span> finish · delivery address · chairs too?</p>
      </div>
      <div style={{ borderTop: "1px solid #ececf2", margin: "18px 0 0", paddingTop: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1a1a2e", margin: "0 0 12px" }}>The whole conversation</div>
        {turn("Dana Whitfield", "do you make the oak dining table in a 2.4m length?", true)}
        {turn("Harbour & Pine assistant", "Our oak dining tables are listed at 1.8m and 2.1m. Anything longer is made to order, so I can't quote a 2.4m from the page — what's it for?", false)}
        {turn("Dana Whitfield", "we're doing a long farmhouse table for a barn conversion, seats ten", true)}
        {turn("Harbour & Pine assistant", "That's well within what the workshop does. When would you need it by?", false)}
        {turn("Dana Whitfield", "end of october ideally. dana@example.com, 0161 496 0142", true)}
      </div>
    </div>
  );
}
