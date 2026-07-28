"use client";

/**
 * Shared print/PDF mechanics for a resume sheet — "Download PDF" is
 * window.print() over a print-scoped stylesheet (no PDF library to
 * maintain; the preview IS the print area, byte-for-byte). Originally lived
 * only in app/resume/resume-client.tsx; extracted here so the tailor-resume
 * slide-in panel (app/job/[id]/TailorPanel.tsx) can reuse the exact same,
 * previously-debugged pagination logic instead of risking a fresh copy of
 * bugs it already fixed (see fitSheetToPages below).
 *
 * CONTRACT a caller must follow: mount the sheet as
 *   <div id="resume-print"><div><ResumeSheet .../></div></div>
 * — exactly two levels of nesting under #resume-print. fitSheetToPages
 * locates the resizable node via #resume-print's firstElementChild's own
 * firstElementChild; any other structure measures/resizes the wrong element
 * and silently breaks pagination (previously: "a 2-page resume came out 6
 * pages"). The wrapper div can be off-screen (position:fixed; left:-99999px)
 * if the caller has no on-screen scaled preview to show — NOT display:none
 * (fitSheetToPages measures offsetHeight on beforeprint while screen CSS is
 * still active; display:none makes it 0 and pagination silently no-ops) and
 * NOT visibility:hidden (stays invisible even once print CSS applies).
 */
import { useEffect } from "react";
import { SHEET_W, SHEET_H } from "@/app/resume/templates";

/** Class marking the print sheet's ancestors — see PRINT_CSS and the mark/unmark below. */
export const PRINT_CHAIN = "rb-print-chain";

/** A4 height at 96dpi. Valid because the designed templates print @page margin 0. */
export const PAGE_H = 1122.5;
/** Below this the type gets too small to be worth saving a page over. */
export const MIN_FIT_ZOOM = 0.78;

/**
 * Fit the sheet to a whole number of pages, on beforeprint. Pass null to undo.
 *
 * Two distinct bugs this kills. A resume that runs a little over — say 1379px
 * against a 1123px page — used to spill a near-empty page 2 holding nothing
 * but the portfolio row, while the navy rail carried on as a stub of empty
 * colour partway down it. Shrinking slightly puts it back on one page.
 *
 * When that isn't possible without shrinking past legibility, we instead round
 * the sheet UP to a whole number of pages: the rail then reaches the bottom of
 * the last page, so a genuine two-pager reads as designed rather than as a
 * layout that ran out partway.
 *
 * `zoom` (not `transform: scale`) because only zoom changes layout, and layout
 * is what pagination measures — a transformed sheet keeps its original height,
 * still breaks in the old place, and gets clipped at the break.
 */
export function fitSheetToPages(bleed: boolean | null) {
  // Two levels down, not one: #resume-print holds a measuring wrapper, and the
  // sheet ResumeSheet draws — the element carrying the fixed 794px width and
  // the full-height rail — is that wrapper's child. Styling the wrapper leaves
  // the sheet at its original width and prints a blank strip down the side.
  const sheet = document.getElementById("resume-print")?.firstElementChild?.firstElementChild as HTMLElement | null;
  if (!sheet) return;
  // Restore rather than remove: width and min-height are React's own inline
  // styles from sheetData()'s consumer, so deleting them would leave the
  // on-screen preview un-sized after the print dialog closes, until some
  // unrelated re-render happened to put them back.
  sheet.style.removeProperty("zoom");
  sheet.style.width = `${SHEET_W}px`;
  sheet.style.minHeight = `${SHEET_H}px`;
  // ATS-safe prints with a normal document margin and is plain single-column
  // text, which the browser already breaks sensibly. Nothing to fit.
  if (bleed !== true) return;

  // offsetHeight, never getBoundingClientRect: beforeprint runs while SCREEN
  // css is still live, and on screen the sheet carries a transform: scale()
  // that fits it into the preview column. A rect would return that shrunken
  // size — measuring ~500px against a 1123px page, concluding everything fits,
  // and silently doing nothing. offsetHeight is layout, so transforms miss it.
  const natural = sheet.offsetHeight;
  if (natural <= PAGE_H + 1) return;
  const pages = Math.ceil(natural / PAGE_H - 0.001);
  const target = (pages - 1) * PAGE_H;

  // Shrinking narrows the sheet, so compensate the width and re-measure —
  // wider lines wrap less and the height doesn't fall linearly with zoom.
  let zoom = 1;
  for (let i = 0; i < 8; i++) {
    const printed = sheet.offsetHeight * zoom;
    if (printed <= target) break;
    const next = zoom * (target / printed) * 0.997; // undershoot; rounding is unkind
    if (next < MIN_FIT_ZOOM) { zoom = 0; break; }
    zoom = next;
    sheet.style.width = `${SHEET_W / zoom}px`;
  }

  if (zoom === 0) {
    // Couldn't save the page. Fill the last one instead so the rail ends at
    // the paper edge rather than mid-page.
    sheet.style.removeProperty("zoom");
    sheet.style.width = `${SHEET_W}px`;
    sheet.style.minHeight = `${pages * PAGE_H}px`;
    return;
  }
  // Applied once, at the end: the loop measures unzoomed layout on purpose and
  // multiplies by the candidate zoom itself, so applying it mid-loop would
  // double-count and the search would never settle.
  sheet.style.setProperty("zoom", String(zoom));
  sheet.style.minHeight = `${target / zoom}px`;
}

/**
 * Page margin depends on the design. The five export templates carry their own
 * generous padding and bleed colour to the paper edge, so a printer margin on
 * top of that would leave a white frame around a full-bleed masthead. ATS-safe
 * is plain text and wants a normal document margin.
 */
export const pageRule = (bleed: boolean) => `@page { margin: ${bleed ? "0" : "12mm"}; }`;

/**
 * Print-only CSS. Screen-layout CSS (grid columns, focus rings, etc.) stays
 * local to whichever component needs it — this is only the @media print
 * portion, since that's the part meant to be shared across every place a
 * #resume-print sheet gets mounted.
 *
 * Print scoping is the subtle part. The obvious approach — `visibility:
 * hidden` on everything but the sheet — is wrong: hidden elements still
 * OCCUPY their layout space, so the surrounding page's several thousand pixels
 * printed as page after page of blank paper, with the sheet offset by
 * whatever sat beside it. So hidden things must be `display: none` — they
 * then take no space at all. But the sheet's own ancestors have to survive,
 * and CSS cannot select "ancestors of X". The caller marks that chain with
 * .rb-print-chain on beforeprint (see usePrintMarking); here we hide every
 * non-marked sibling and strip the marked ancestors of anything that would
 * constrain or offset the sheet (grid tracks, sticky offsets, padding, 100vh
 * heights, overflow clipping, and any transform — a slide-in panel's own
 * open/close transform must not survive onto the printed page).
 *
 * print-color-adjust: exact keeps the navy header band and gradient accents
 * on paper — without it most browsers strip backgrounds and the white-on-navy
 * header prints as a blank block.
 */
export const PRINT_CSS = `
@media print {
  body > *:not(.rb-print-chain),
  .rb-print-chain > *:not(.rb-print-chain):not(#resume-print) { display: none !important; }
  .rb-print-chain {
    display: block !important; position: static !important; transform: none !important;
    width: auto !important; max-width: none !important; min-width: 0 !important;
    height: auto !important; min-height: 0 !important; max-height: none !important;
    margin: 0 !important; padding: 0 !important;
    overflow: visible !important; background: none !important; gap: 0 !important;
  }
  /* The preview is scaled down to fit its column; paper is the real size, so
     the transform comes off and the sheet prints at its designed width. */
  .rb-scale-box { height: auto !important; overflow: visible !important; }
  #resume-print {
    position: static !important; width: 100% !important; overflow: visible !important;
    transform: none !important;
    box-shadow: none !important; border: none !important; border-radius: 0 !important;
    margin: 0 !important;
  }
  #resume-print, #resume-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Short blocks shouldn't be split across the page break. Only applied to
     items that are always well under a page tall — never whole sections,
     which would push an over-long one onto a fresh page and leave a gap. */
  .rb-keep { break-inside: avoid; page-break-inside: avoid; }
  /* On screen, these spacers pin the quote card / QR to the sheet's bottom
     edge — the polished one-page look. In PRINT they are the bug: when
     content overflows a page they stretch, leaving a half-empty page 1 and
     dumping the pinned blocks alone onto page 2. Collapse them so printed
     content flows naturally top-down. */
  .rb-flex { flex: 0 0 0 !important; }
}
`;

/**
 * Marks #resume-print's ancestor chain with .rb-print-chain on beforeprint
 * (so PRINT_CSS can hide everything else and un-constrain the survivors) and
 * fits the sheet to a whole number of pages, unwinding both on afterprint so
 * the screen layout is never left altered. One line for any caller that
 * renders a #resume-print sheet and wants Download PDF / Ctrl+P to work.
 */
export function usePrintMarking(bleed: boolean | null) {
  useEffect(() => {
    const mark = () => {
      let el = document.getElementById("resume-print")?.parentElement ?? null;
      while (el && el !== document.body) { el.classList.add(PRINT_CHAIN); el = el.parentElement; }
      fitSheetToPages(bleed);
    };
    const unmark = () => {
      document.querySelectorAll(`.${PRINT_CHAIN}`).forEach((e) => e.classList.remove(PRINT_CHAIN));
      fitSheetToPages(null);
    };
    window.addEventListener("beforeprint", mark);
    window.addEventListener("afterprint", unmark);
    return () => {
      window.removeEventListener("beforeprint", mark);
      window.removeEventListener("afterprint", unmark);
      unmark();
    };
  }, [bleed]);
}
