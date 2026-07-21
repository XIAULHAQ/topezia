"use client";

/**
 * Click-to-play video, showing our own poster and play button.
 *
 * A bare YouTube iframe paints the video title, the channel avatar and a
 * "Watch on YouTube" button across the top before anyone touches it. None of
 * that can be turned off by parameter — but it is all drawn INSIDE the iframe,
 * so not creating the iframe until someone clicks play removes it from the
 * page entirely. What a visitor sees on arrival is a poster served from our own
 * domain and a play button we drew.
 *
 * Once playing, YouTube's own chrome is back on hover. See the note in
 * video.ts: the embedded player can't be restyled, and dropping an overlay on
 * top of it to hide the title would break the ToS every embed is licensed
 * under. This gets the still frame clean, which is the state the page is in
 * almost all of the time.
 *
 * It is also a real performance win — an unplayed YouTube iframe pulls roughly
 * a megabyte of player JS, and portfolio pages can carry several.
 */
import { useState, type CSSProperties } from "react";

export default function VideoEmbed({
  embedUrl,
  posterUrl,
  title,
}: {
  /** Already built with autoplay=1 — the click is the user gesture that allows it. */
  embedUrl: string;
  posterUrl: string | null;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div style={S.frame}>
        <iframe
          src={embedUrl}
          title={title}
          style={S.iframe}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setPlaying(true)} style={{ ...S.frame, ...S.facade }} aria-label={`Play: ${title}`}>
      {posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterUrl} alt="" style={S.poster} loading="lazy" decoding="async" />
      )}
      <span style={S.scrim} aria-hidden="true" />
      <span style={S.play} aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 3 }}>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </button>
  );
}

const S: Record<string, CSSProperties> = {
  frame: {
    position: "relative", display: "block", width: "100%", aspectRatio: "16 / 9",
    borderRadius: 14, overflow: "hidden", background: "#000",
  },
  facade: { border: 0, padding: 0, cursor: "pointer", appearance: "none" },
  iframe: { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 },
  // hqdefault is 4:3 with letterbox bars baked in; cover crops them off.
  poster: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  scrim: {
    position: "absolute", inset: 0,
    background: "linear-gradient(180deg, rgba(15,23,42,.10), rgba(15,23,42,.34))",
  },
  play: {
    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 64, height: 64, borderRadius: "50%",
    background: "rgba(255,255,255,.94)", color: "#0F172A",
    boxShadow: "0 8px 28px rgba(15,23,42,.34)",
  },
};
