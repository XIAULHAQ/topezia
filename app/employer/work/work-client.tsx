"use client";

/**
 * The company's work list and its editor.
 *
 * One page rather than list + /new + /edit routes: a case study is half a
 * dozen fields and some images, and three routes for that would mean three
 * loading states and two round-trips to change a title. The editor opens in
 * place and the list stays visible behind it.
 *
 * Drafts are listed exactly like published work, with the difference stated on
 * the row. An employer who can't tell at a glance what is public has no way to
 * trust the page.
 */
import { useCallback, useEffect, useState } from "react";
import { EmployerSection, EmployerGate, ES } from "../_components/EmployerSection";
// Same parser the member portfolio uses — one definition of "is this a
// YouTube link", shared rather than re-implemented.
import { parseVideo } from "@/lib/portfolio/video";

type WorkMedia = {
  kind: "IMAGE" | "VIDEO";
  /** IMAGE: the storage path. VIDEO: the provider id — never a URL. */
  path: string;
  videoId: string | null;
  videoProvider: "YOUTUBE" | "VIMEO" | null;
  videoHash: string | null;
  width: number | null;
  height: number | null;
  caption: string | null;
};
type Work = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  clientName: string | null;
  projectUrl: string | null;
  tags: string[];
  coverPath: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  status: "DRAFT" | "PUBLISHED";
  media: WorkMedia[];
};

type Draft = {
  id: string | null;
  title: string;
  summary: string;
  description: string;
  clientName: string;
  projectUrl: string;
  tagsText: string;
  coverPath: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  media: WorkMedia[];
  status: "DRAFT" | "PUBLISHED";
};

const BLANK: Draft = {
  id: null, title: "", summary: "", description: "", clientName: "", projectUrl: "",
  tagsText: "", coverPath: null, coverWidth: null, coverHeight: null, media: [], status: "DRAFT",
};

const toDraft = (w: Work): Draft => ({
  id: w.id,
  title: w.title,
  summary: w.summary ?? "",
  description: w.description ?? "",
  clientName: w.clientName ?? "",
  projectUrl: w.projectUrl ?? "",
  tagsText: w.tags.join(", "),
  coverPath: w.coverPath,
  coverWidth: w.coverWidth,
  coverHeight: w.coverHeight,
  media: w.media.map((m) => ({
    kind: m.kind, path: m.path, videoId: m.videoId, videoProvider: m.videoProvider,
    videoHash: m.videoHash, width: m.width, height: m.height, caption: m.caption,
  })),
  status: w.status,
});

/** Uploads through our own route, which sniffs the bytes and picks the path. */
async function uploadImage(file: File, kind: "work" | "client" | "article") {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/company/image?kind=${kind}`, { method: "POST", body });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Couldn't upload that image.");
  return d as { path: string; url: string; width: number | null; height: number | null };
}

const imgUrl = (path: string) => {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/company/${path}`;
};

export default function WorkClient() {
  const [work, setWork] = useState<Work[] | null>(null);
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<"auth" | "company" | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [videoInput, setVideoInput] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/company/work", { cache: "no-store" });
    if (res.status === 401) { setGate("auth"); setWork([]); return; }
    if (res.status === 409) { setGate("company"); setWork([]); return; }
    if (!res.ok) { setError("Couldn't load your work."); setWork([]); return; }
    const d = await res.json();
    setWork(d.work);
    setCompanySlug(d.companySlug);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft) return;
    setSaving(true); setError(null);
    try {
      const payload = {
        title: draft.title,
        summary: draft.summary,
        description: draft.description,
        clientName: draft.clientName,
        projectUrl: draft.projectUrl,
        tags: draft.tagsText.split(",").map((t) => t.trim()).filter(Boolean),
        coverPath: draft.coverPath,
        coverWidth: draft.coverWidth,
        coverHeight: draft.coverHeight,
        media: draft.media,
        status: draft.status,
      };
      const res = await fetch(draft.id ? `/api/company/work/${draft.id}` : "/api/company/work", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't save that.");
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(w: Work) {
    if (!window.confirm(`Delete "${w.title}"? Its images and videos go too, and this can't be undone.`)) return;
    setBusyId(w.id); setError(null);
    try {
      const res = await fetch(`/api/company/work/${w.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't delete that.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete that.");
    } finally {
      setBusyId(null);
    }
  }

  async function pickCover(file: File) {
    setUploading(true); setError(null);
    try {
      const up = await uploadImage(file, "work");
      setDraft((d) => (d ? { ...d, coverPath: up.path, coverWidth: up.width, coverHeight: up.height } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that image.");
    } finally {
      setUploading(false);
    }
  }

  async function addGallery(files: File[]) {
    setUploading(true); setError(null);
    try {
      for (const file of files.slice(0, 12)) {
        const up = await uploadImage(file, "work");
        setDraft((d) =>
          d
            ? {
                ...d,
                media: [
                  ...d.media,
                  { kind: "IMAGE", path: up.path, videoId: null, videoProvider: null, videoHash: null, width: up.width, height: up.height, caption: null },
                ],
              }
            : d
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that image.");
    } finally {
      setUploading(false);
    }
  }

  /**
   * A pasted link becomes a provider + id HERE as well as on the server.
   * Client-side so a typo is caught while the paste is still on screen, and
   * again server-side because a client check is a convenience, never a gate
   * (lib/company/save.ts re-parses it).
   */
  function addVideo() {
    const raw = videoInput.trim();
    if (!raw || !draft) return;
    const ref = parseVideo(raw);
    if (!ref) { setError("That doesn't look like a YouTube or Vimeo link."); return; }
    if (draft.media.some((m) => m.kind === "VIDEO" && m.videoId === ref.id)) {
      setError("That video is already on this piece of work.");
      return;
    }
    setError(null);
    setVideoInput("");
    setDraft({
      ...draft,
      media: [
        ...draft.media,
        { kind: "VIDEO", path: ref.id, videoId: ref.id, videoProvider: ref.provider, videoHash: ref.hash, width: null, height: null, caption: null },
      ],
    });
  }

  if (gate) return <EmployerGate title="Our work" reason={gate} what="your work" />;

  return (
    <EmployerSection
      title="Our work"
      subtitle="Case studies, shipped products, campaigns. Published work appears on your public company page; drafts stay private until you publish them."
      actions={
        !draft && (
          <button type="button" style={ES.btn} onClick={() => setDraft({ ...BLANK })}>
            Add work
          </button>
        )
      }
    >
      {error && <div style={ES.error}>{error}</div>}

      {draft && (
        <div style={{ ...ES.card, marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>{draft.id ? "Edit work" : "New work"}</h2>

          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={ES.label}>Title</label>
              <input style={ES.input} value={draft.title} maxLength={140}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Brand identity for Sagebrush Outfitters" />
            </div>

            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label style={ES.label}>Client</label>
                <input style={ES.input} value={draft.clientName} maxLength={120}
                  onChange={(e) => setDraft({ ...draft, clientName: e.target.value })}
                  placeholder="Sagebrush Outfitters" />
              </div>
              <div>
                <label style={ES.label}>Link to the work</label>
                <input style={ES.input} value={draft.projectUrl} maxLength={300}
                  onChange={(e) => setDraft({ ...draft, projectUrl: e.target.value })}
                  placeholder="sagebrush.com" />
              </div>
            </div>

            <div>
              <label style={ES.label}>One-line summary</label>
              <input style={ES.input} value={draft.summary} maxLength={200}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                placeholder="A full rebrand, from wordmark to trailer wrap." />
            </div>

            <div>
              <label style={ES.label}>The story</label>
              <textarea style={{ ...ES.input, minHeight: 140, resize: "vertical", lineHeight: 1.65 }}
                value={draft.description} maxLength={6000}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What the client needed, what you did, what changed." />
              <p style={S.hint}>{draft.description.trim().split(/\s+/).filter(Boolean).length} words. Around 25 words is the point where this page can earn its place in search results.</p>
            </div>

            <div>
              <label style={ES.label}>Tags</label>
              <input style={ES.input} value={draft.tagsText} maxLength={400}
                onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })}
                placeholder="Branding, Packaging, Web design" />
              <p style={S.hint}>Comma separated.</p>
            </div>

            <div>
              <label style={ES.label}>Cover image</label>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                {draft.coverPath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgUrl(draft.coverPath)} alt="" style={S.thumb} />
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ ...ES.btnGhost, display: "inline-block" }}>
                    {draft.coverPath ? "Replace" : "Upload"} cover
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickCover(f); }} />
                  </label>
                  {draft.coverPath && (
                    <button type="button" style={ES.btnGhost} onClick={() => setDraft({ ...draft, coverPath: null, coverWidth: null, coverHeight: null })}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label style={ES.label}>Images &amp; videos</label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                {draft.media.map((m, i) => (
                  <div key={`${m.kind}-${m.path}-${i}`} style={{ position: "relative" }}>
                    {m.kind === "VIDEO" ? (
                      // No thumbnail here on purpose: the poster comes from the
                      // provider through our proxy, and fetching it just to
                      // decorate the editor would slow the panel for nothing.
                      <div style={S.videoChip}>
                        <span style={{ fontSize: 16 }}>▶</span>
                        <span>{m.videoProvider === "VIMEO" ? "Vimeo" : "YouTube"}</span>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imgUrl(m.path)} alt="" style={S.thumb} />
                    )}
                    <button type="button" aria-label="Remove" style={S.thumbX}
                      onClick={() => setDraft({ ...draft, media: draft.media.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <input style={{ ...ES.input, flex: "1 1 260px" }} value={videoInput}
                  onChange={(e) => setVideoInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVideo(); } }}
                  placeholder="Paste a YouTube or Vimeo link" />
                <button type="button" style={ES.btnGhost} onClick={addVideo}>Add video</button>
              </div>

              <label style={{ ...ES.btnGhost, display: "inline-block" }}>
                Add images
                <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" style={{ display: "none" }}
                  onChange={(e) => {
                    // Array.from FIRST. `e.target.files` is a LIVE FileList —
                    // clearing the input's value empties it, so reading it
                    // after the reset yields nothing and the upload silently
                    // never happens. The cover input survived the same bug
                    // only because `?.[0]` copies a real File out first.
                    const picked = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (picked.length) addGallery(picked);
                  }} />
              </label>
              {uploading && <span style={{ ...S.hint, marginLeft: 10 }}>Uploading…</span>}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingTop: 4 }}>
              <select style={{ ...ES.input, width: "auto" }} value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as "DRAFT" | "PUBLISHED" })}>
                <option value="DRAFT">Draft — only you can see it</option>
                <option value="PUBLISHED">Published — live on your company page</option>
              </select>
              <button type="button" style={{ ...ES.btn, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" style={ES.btnGhost} onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {!work && <p style={ES.empty}>Loading…</p>}

      {work && work.length === 0 && !draft && (
        <div style={ES.card}>
          <p style={ES.empty}>
            Nothing here yet. Your work is the part of a company page people actually read — one case study with a real
            story does more than a list of services.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {(work ?? []).map((w) => (
          <div key={w.id} style={{ ...ES.card, display: "flex", gap: 16, alignItems: "center", padding: 14 }}>
            <div style={S.rowThumb}>
              {w.coverPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgUrl(w.coverPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 18 }}>🖼️</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontSize: 14.5 }}>{w.title}</b>
                <span style={w.status === "PUBLISHED" ? ES.pillLive : ES.pillDraft}>
                  {w.status === "PUBLISHED" ? "Published" : "Draft"}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 5 }}>
                {[w.clientName, w.summary].filter(Boolean).join(" · ") || "No summary yet"}
              </div>
            </div>
            <div style={{ flex: "none", display: "flex", gap: 8, flexWrap: "wrap" }}>
              {w.status === "PUBLISHED" && companySlug && (
                <a style={ES.btnGhost} href={`/company/${companySlug}/work/${w.slug}`} target="_blank" rel="noreferrer">View</a>
              )}
              <button type="button" style={ES.btnGhost} onClick={() => { setDraft(toDraft(w)); setError(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
              <button type="button" style={{ ...ES.btnDanger, opacity: busyId === w.id ? 0.6 : 1 }} disabled={busyId === w.id} onClick={() => remove(w)}>
                {busyId === w.id ? "…" : "Delete"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </EmployerSection>
  );
}

const S: Record<string, React.CSSProperties> = {
  hint: { margin: "6px 0 0", fontSize: 11.5, color: "#94A3B8", lineHeight: 1.5 },
  thumb: { width: 84, height: 62, objectFit: "cover", borderRadius: 10, border: "1px solid #E2E8F0", display: "block" },
  thumbX: { position: "absolute", top: -7, right: -7, width: 22, height: 22, borderRadius: "50%", border: "1px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 14, lineHeight: 1, cursor: "pointer" },
  rowThumb: { flex: "none", width: 64, height: 48, borderRadius: 10, overflow: "hidden", background: "#F1F5F9", display: "grid", placeItems: "center" },
  videoChip: { width: 84, height: 62, borderRadius: 10, border: "1px solid #E2E8F0", background: "#0F172A", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontSize: 10.5, fontWeight: 700 },
};
