"use client";

/**
 * Portfolio editor — create and edit.
 *
 * Uploads happen as soon as a file is picked, not on submit: a 10-image gallery
 * submitted in one request would sit on a spinner for a long time with no idea
 * how far along it is, and one failure would lose the lot. Each image is its own
 * request with its own state, so a failure is per-tile and retryable.
 *
 * Videos are YouTube links for now. Only the extracted id is sent; see
 * lib/portfolio/video.ts for why a pasted URL never reaches an iframe.
 */
import { useState, useRef, type CSSProperties, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { C, GRAD, FONT, Icon } from "@/app/_components/ui";
import { PORTFOLIO_CATEGORIES, CATEGORY_GROUPS } from "@/lib/portfolio/categories";
import { LIMITS } from "@/lib/portfolio/save";

type Tile = {
  key: string;
  kind: "IMAGE" | "VIDEO";
  /** Storage path (image) or YouTube id (video), once it exists server-side. */
  path?: string;
  /** Local object URL while uploading, so the tile shows something immediately. */
  preview?: string;
  width?: number | null;
  height?: number | null;
  state: "uploading" | "ready" | "error";
  error?: string;
};

export type ExistingPortfolio = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  coverPath: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  skills: string[];
  technologies: string[];
  media: { kind: string; path: string; videoId: string | null; width: number | null; height: number | null }[];
};

const newKey = () => Math.random().toString(36).slice(2);

export default function PortfolioEditor({ existing }: { existing?: ExistingPortfolio }) {
  const router = useRouter();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [skills, setSkills] = useState<string[]>(existing?.skills ?? []);
  const [technologies, setTechnologies] = useState<string[]>(existing?.technologies ?? []);
  const [cover, setCover] = useState<Tile | null>(
    existing?.coverPath
      ? { key: newKey(), kind: "IMAGE", path: existing.coverPath, width: existing.coverWidth, height: existing.coverHeight, state: "ready" }
      : null
  );
  const [tiles, setTiles] = useState<Tile[]>(
    (existing?.media ?? []).map((m) => ({
      key: newKey(),
      kind: m.kind === "VIDEO" ? "VIDEO" : "IMAGE",
      path: m.kind === "VIDEO" ? m.videoId ?? m.path : m.path,
      width: m.width,
      height: m.height,
      state: "ready" as const,
    }))
  );
  const [videoInput, setVideoInput] = useState("");
  const [saving, setSaving] = useState<"idle" | "draft" | "publish">("idle");
  const [error, setError] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File): Promise<Partial<Tile>> {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/portfolio/upload", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed.");
    return { path: data.path, width: data.width, height: data.height, state: "ready" };
  }

  async function onPickCover(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after a failure
    if (!file) return;
    const key = newKey();
    setCover({ key, kind: "IMAGE", preview: URL.createObjectURL(file), state: "uploading" });
    try {
      const done = await uploadOne(file);
      setCover((c) => (c && c.key === key ? { ...c, ...done } : c));
    } catch (err) {
      setCover((c) => (c && c.key === key ? { ...c, state: "error", error: err instanceof Error ? err.message : "Upload failed." } : c));
    }
  }

  async function onPickGallery(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const room = LIMITS.media - tiles.length;
    if (room <= 0) { setError(`A portfolio can hold ${LIMITS.media} items.`); return; }

    const batch = files.slice(0, room).map((file) => ({
      file,
      tile: { key: newKey(), kind: "IMAGE" as const, preview: URL.createObjectURL(file), state: "uploading" as const },
    }));
    setTiles((t) => [...t, ...batch.map((b) => b.tile)]);

    // In parallel — each tile owns its own outcome, so one failure doesn't
    // cancel the rest of the batch.
    await Promise.all(
      batch.map(async ({ file, tile }) => {
        try {
          const done = await uploadOne(file);
          setTiles((t) => t.map((x) => (x.key === tile.key ? { ...x, ...done } : x)));
        } catch (err) {
          setTiles((t) => t.map((x) => (x.key === tile.key ? { ...x, state: "error", error: err instanceof Error ? err.message : "Upload failed." } : x)));
        }
      })
    );
  }

  function addVideo() {
    const raw = videoInput.trim();
    if (!raw) return;
    if (tiles.length >= LIMITS.media) { setError(`A portfolio can hold ${LIMITS.media} items.`); return; }
    // The server is the authority on what counts as a valid link; this just
    // stages it. An unrecognised URL comes back as a validation error on save.
    setTiles((t) => [...t, { key: newKey(), kind: "VIDEO", path: raw, state: "ready" }]);
    setVideoInput("");
  }

  const removeTile = (key: string) => setTiles((t) => t.filter((x) => x.key !== key));
  const move = (key: string, dir: -1 | 1) =>
    setTiles((t) => {
      const i = t.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= t.length) return t;
      const copy = [...t];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  async function save(publish: boolean) {
    setError(null);
    if (tiles.some((t) => t.state === "uploading") || cover?.state === "uploading") {
      setError("Hold on — some images are still uploading.");
      return;
    }
    setSaving(publish ? "publish" : "draft");
    try {
      const payload = {
        title,
        description,
        category,
        coverPath: cover?.state === "ready" ? cover.path ?? null : null,
        coverWidth: cover?.width ?? null,
        coverHeight: cover?.height ?? null,
        skills,
        technologies,
        media: tiles
          .filter((t) => t.state === "ready" && t.path)
          .map((t) => ({ kind: t.kind, path: t.path!, width: t.width ?? null, height: t.height ?? null })),
        publish,
      };
      const res = await fetch(existing ? `/api/portfolio/${existing.id}` : "/api/portfolio", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      router.push(`/portfolio/${data.portfolio.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setSaving("idle");
    }
  }

  const busy = saving !== "idle";

  return (
    <div style={S.wrap}>
      <style>{CSS}</style>

      <h1 style={S.h1}>{existing ? "Edit work" : "Add work to your portfolio"}</h1>
      <p style={S.sub}>Show what you&apos;ve made. Published work is public and can be shared with anyone — no account needed to view it.</p>

      {/* ── Cover ── */}
      <label style={S.label}>Cover image</label>
      <div style={S.hint}>The one image people see in the grid.</div>
      <div className="pf-cover" style={S.coverBox} onClick={() => !busy && coverInput.current?.click()}>
        {cover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.preview ?? publicUrl(cover.path)} alt="" style={S.coverImg} />
            {cover.state === "uploading" && <div style={S.tileOverlay}>Uploading…</div>}
            {cover.state === "error" && <div style={{ ...S.tileOverlay, background: "rgba(180,35,24,.85)" }}>{cover.error}</div>}
          </>
        ) : (
          <div style={S.coverEmpty}><Icon name="upload" size={20} /><span>Choose a cover image</span><span style={S.tiny}>JPEG, PNG, WebP or AVIF · up to 10MB</span></div>
        )}
      </div>
      <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={onPickCover} style={{ display: "none" }} />
      {cover && <button type="button" onClick={() => setCover(null)} style={S.textBtn} disabled={busy}>Remove cover</button>}

      {/* ── Basics ── */}
      <label style={S.label} htmlFor="pf-title">Title</label>
      <input id="pf-title" style={S.input} value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. MONOLAB — Brand Identity" disabled={busy} />

      <label style={S.label} htmlFor="pf-cat">Category</label>
      <select id="pf-cat" style={S.input} value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy}>
        <option value="">Choose a category…</option>
        {CATEGORY_GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {PORTFOLIO_CATEGORIES.filter((c) => c.group === g).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </optgroup>
        ))}
      </select>

      <label style={S.label} htmlFor="pf-desc">Description</label>
      <div style={S.hint}>The client, the brief, what you actually did.</div>
      <textarea id="pf-desc" style={{ ...S.input, minHeight: 130, resize: "vertical" }} value={description} maxLength={LIMITS.description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />

      {/* ── Gallery ── */}
      <label style={S.label}>Gallery</label>
      <div style={S.hint}>Images upload straight away. Videos are YouTube links for now.</div>

      <div style={S.tileGrid}>
        {tiles.map((t, i) => (
          <div key={t.key} style={S.tile}>
            {t.kind === "VIDEO" ? (
              <div style={S.videoTile}><Icon name="play" size={18} /><span style={S.tiny}>YouTube</span></div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.preview ?? publicUrl(t.path)} alt="" style={S.tileImg} />
            )}
            {t.state === "uploading" && <div style={S.tileOverlay}>Uploading…</div>}
            {t.state === "error" && <div style={{ ...S.tileOverlay, background: "rgba(180,35,24,.85)", fontSize: 11 }}>{t.error}</div>}
            <div style={S.tileBar}>
              <button type="button" onClick={() => move(t.key, -1)} disabled={i === 0 || busy} style={S.tileBtn} aria-label="Move earlier">←</button>
              <button type="button" onClick={() => move(t.key, 1)} disabled={i === tiles.length - 1 || busy} style={S.tileBtn} aria-label="Move later">→</button>
              <button type="button" onClick={() => removeTile(t.key)} disabled={busy} style={{ ...S.tileBtn, marginLeft: "auto" }} aria-label="Remove">✕</button>
            </div>
          </div>
        ))}
        <div style={{ ...S.tile, ...S.addTile }} onClick={() => !busy && galleryInput.current?.click()}>
          <Icon name="upload" size={18} /><span style={S.tiny}>Add images</span>
        </div>
      </div>
      <input ref={galleryInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={onPickGallery} style={{ display: "none" }} />

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <input style={{ ...S.input, flex: "1 1 260px", marginTop: 0 }} value={videoInput} onChange={(e) => setVideoInput(e.target.value)} placeholder="Paste a YouTube link" disabled={busy}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVideo(); } }} />
        <button type="button" onClick={addVideo} style={S.ghostBtn} disabled={busy}>Add video</button>
      </div>

      <TagField label="Skills used" hint="What you brought to it — art direction, copywriting, user research." values={skills} onChange={setSkills} max={LIMITS.skills} disabled={busy} />
      <TagField label="Technology used" hint="Tools and stack — Figma, Next.js, After Effects." values={technologies} onChange={setTechnologies} max={LIMITS.technologies} disabled={busy} />

      {error && <p style={S.error}>{error}</p>}

      <div style={S.actions}>
        <button type="button" onClick={() => save(true)} className="pf-primary" style={S.primary} disabled={busy}>
          {saving === "publish" ? "Publishing…" : "Publish"}
        </button>
        <button type="button" onClick={() => save(false)} style={S.ghostBtn} disabled={busy}>
          {saving === "draft" ? "Saving…" : "Save as draft"}
        </button>
      </div>
      <p style={S.tiny}>Drafts are private to you. Publishing makes this page public and shareable.</p>
    </div>
  );
}

/** Free-text chips: type, Enter to add, click ✕ to drop. */
function TagField({ label, hint, values, onChange, max, disabled }: {
  label: string; hint: string; values: string[]; onChange: (v: string[]) => void; max: number; disabled: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim().replace(/\s+/g, " ");
    if (!t) return;
    if (values.some((v) => v.toLowerCase() === t.toLowerCase())) { setDraft(""); return; }
    if (values.length >= max) return;
    onChange([...values, t.slice(0, LIMITS.tag)]);
    setDraft("");
  };
  return (
    <>
      <label style={S.label}>{label}</label>
      <div style={S.hint}>{hint}</div>
      <div style={S.chipRow}>
        {values.map((v) => (
          <span key={v} style={S.chip}>
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} style={S.chipX} disabled={disabled} aria-label={`Remove ${v}`}>✕</button>
          </span>
        ))}
      </div>
      <input
        style={S.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={values.length >= max ? `${max} is the limit` : "Type and press Enter"}
        disabled={disabled || values.length >= max}
      />
    </>
  );
}

/** Mirrors lib/portfolio/storage.ts — the bucket is public, so this is a plain URL. */
function publicUrl(path?: string): string {
  if (!path) return "";
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/portfolio/${path}`;
}

const CSS = `
.pf-cover:hover{border-color:#A5B4FC!important}
.pf-primary:hover{filter:brightness(1.08)}
`;

const S: Record<string, CSSProperties> = {
  wrap: { maxWidth: 720, fontFamily: FONT },
  h1: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", margin: "0 0 6px" },
  sub: { color: C.mut, fontSize: 14, margin: "0 0 26px", lineHeight: 1.6 },
  label: { display: "block", fontSize: 13, fontWeight: 700, color: C.ink, margin: "22px 0 4px" },
  hint: { fontSize: 12.5, color: C.mut, marginBottom: 8, lineHeight: 1.5 },
  input: { width: "100%", padding: "11px 13px", fontSize: 14.5, borderRadius: 10, border: `1px solid ${C.line}`, fontFamily: "inherit", background: "#fff", marginTop: 2 },
  coverBox: { border: `1.5px dashed ${C.line}`, borderRadius: 16, minHeight: 200, display: "grid", placeItems: "center", cursor: "pointer", overflow: "hidden", position: "relative", background: "#fff", transition: "border-color .15s" },
  coverImg: { width: "100%", height: 260, objectFit: "cover", display: "block" },
  coverEmpty: { display: "grid", placeItems: "center", gap: 6, color: C.mut, fontSize: 13.5, padding: 40, textAlign: "center" },
  tileGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(140px,100%),1fr))", gap: 10 },
  tile: { position: "relative", aspectRatio: "1", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.line}`, background: "#F8FAFC" },
  tileImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  videoTile: { width: "100%", height: "100%", display: "grid", placeItems: "center", gap: 4, color: C.slate, background: "#EEF2FF" },
  addTile: { display: "grid", placeItems: "center", gap: 4, color: C.mut, cursor: "pointer", borderStyle: "dashed", aspectRatio: "1" },
  tileOverlay: { position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(15,23,42,.6)", color: "#fff", fontSize: 12, fontWeight: 600, padding: 8, textAlign: "center" },
  tileBar: { position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", gap: 4, padding: 5, background: "linear-gradient(transparent,rgba(15,23,42,.65))" },
  tileBtn: { width: 24, height: 24, borderRadius: 6, border: "none", background: "rgba(255,255,255,.9)", cursor: "pointer", fontSize: 11, lineHeight: 1, color: C.ink },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 7 },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, background: "#EEF2FF", color: C.c1, border: "1px solid #C7D2FE", borderRadius: 999, padding: "5px 8px 5px 12px", fontSize: 12.5, fontWeight: 600 },
  chipX: { border: "none", background: "none", cursor: "pointer", color: C.c1, fontSize: 11, padding: 0, lineHeight: 1 },
  textBtn: { border: "none", background: "none", color: C.c1, fontWeight: 600, fontSize: 13, cursor: "pointer", padding: "8px 0" },
  ghostBtn: { border: `1px solid ${C.line}`, background: "#fff", borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 600, color: C.slate, cursor: "pointer", fontFamily: "inherit" },
  primary: { border: "none", background: GRAD, color: "#fff", borderRadius: 10, padding: "12px 26px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  actions: { display: "flex", gap: 10, marginTop: 28, flexWrap: "wrap" },
  error: { color: "#b42318", fontSize: 13.5, marginTop: 18 },
  tiny: { fontSize: 11.5, color: C.mut, marginTop: 10, lineHeight: 1.5 },
};
