/**
 * Topezia chat widget loader — the ONLY file a customer's site runs.
 *
 * One script tag:
 *   <script src="https://www.topezia.com/widget.js" data-topezia="SITE_TOKEN" async></script>
 *
 * Everything real happens inside an iframe on our origin; this file draws
 * the bubble, the frame, and — crucially — a REAL-LOOKING PANEL WHILE THE
 * FRAME LOADS. An iframe renders nothing until its HTML arrives, and ours
 * takes half a second or more, which reads as "this thing is broken" at the
 * exact moment a visitor is deciding whether to trust it. So the loader
 * paints the company's own name, mark, colour and opening line immediately
 * from a small cached config call, and swaps in the live chat underneath.
 *
 * Kept dumb on purpose: this code runs on someone else's website, where our
 * bugs become their bugs. No dependencies, no cookies, no reading of the
 * host page.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var token = script.getAttribute("data-topezia");
  if (!token || !/^[A-Za-z0-9_-]{10,64}$/.test(token)) return;
  var origin = new URL(script.src).origin;

  var DEFAULT_GRAD = "linear-gradient(135deg,#8B5CF6,#3B82F6)";
  var MOBILE = "(max-width: 640px)";
  var SESSION_KEY = "tz_opened_" + token;

  var open = false;
  var frame = null;
  var shell = null;
  var cfg = { accent: null, name: "", logo: null, greeting: "", proactive: false, proactiveDelay: 20, sound: false };
  var grad = DEFAULT_GRAD;

  function shade(hex) {
    var n = parseInt(hex.slice(1), 16);
    var s = function (c) { return Math.max(0, Math.round(c * 0.72)); };
    var h = function (c) { return ("0" + c.toString(16)).slice(-2); };
    return "#" + h(s((n >> 16) & 255)) + h(s((n >> 8) & 255)) + h(s(n & 255));
  }

  // ── the launcher ──────────────────────────────────────────────────────
  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Open chat");
  btn.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M4 4h16v12H7l-3 3z"/></svg>';
  btn.style.cssText =
    "position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;" +
    "background:" + grad + ";box-shadow:0 8px 24px rgba(59,60,246,.35);" +
    "display:flex;align-items:center;justify-content:center;z-index:2147483000;";

  /**
   * The placeholder panel. Geometry matches the iframe exactly so the swap
   * is invisible — same corner, same size, same radius.
   */
  function buildShell() {
    var mobile = window.matchMedia(MOBILE).matches;
    var el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      (mobile
        ? "position:fixed;inset:0;width:100%;height:100%;border-radius:0;"
        : "position:fixed;right:20px;bottom:88px;width:380px;height:560px;max-width:calc(100vw - 24px);" +
          "max-height:calc(100vh - 110px);border-radius:16px;box-shadow:0 12px 48px rgba(15,23,42,.28);") +
      "background:#fff;z-index:2147483001;overflow:hidden;" +
      "font-family:-apple-system,Segoe UI,Roboto,sans-serif;";

    var mark = cfg.logo
      ? '<img src="' + cfg.logo + '" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:50%">'
      : '<span style="font-size:13px;font-weight:800;color:#fff">' +
        (cfg.name || "?").trim().slice(0, 2).toUpperCase() + "</span>";

    el.innerHTML =
      '<div style="padding:12px 16px 10px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;gap:10px">' +
        '<span style="flex:none;width:36px;height:36px;border-radius:50%;background:' + grad +
          ';display:grid;place-items:center;overflow:hidden;padding:2px">' + mark + "</span>" +
        '<span style="min-width:0;flex:1">' +
          '<b style="font-size:14px;display:block;color:#0F172A">' + escapeHtml(cfg.name) + "</b>" +
          '<span style="font-size:11px;color:#94A3B8">Connecting…</span>' +
        "</span>" +
      "</div>" +
      '<div style="padding:14px 12px">' +
        '<div style="max-width:85%;background:#F1F5F9;color:#0F172A;border-radius:14px;border-bottom-left-radius:4px;' +
          'padding:9px 13px;font-size:13.5px;line-height:1.55">' + escapeHtml(cfg.greeting) + "</div>" +
      "</div>";
    return el;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /**
   * Phones get the whole screen, the way every chat app people already know
   * behaves — a 380px card floating over a 375px viewport is a scrollbar
   * sandwich. Desktop keeps the corner card. Re-applied on resize/rotate.
   */
  function sizeFrame() {
    if (!frame) return;
    var mobile = window.matchMedia(MOBILE).matches;
    if (mobile) {
      frame.style.cssText =
        "position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;" +
        "border:none;border-radius:0;z-index:2147483000;background:#fff;" +
        "display:" + (open ? "block" : "none");
    } else {
      frame.style.cssText =
        "position:fixed;right:20px;bottom:88px;width:380px;height:560px;max-width:calc(100vw - 24px);" +
        "max-height:calc(100vh - 110px);border:none;border-radius:16px;z-index:2147483000;" +
        "box-shadow:0 12px 48px rgba(15,23,42,.28);background:#fff;" +
        "display:" + (open ? "block" : "none");
    }
    // The bubble would sit on top of a full-screen chat; hide it while open.
    btn.style.display = mobile && open ? "none" : "flex";
  }

  /**
   * A soft two-note chime when the chat opens ITSELF.
   *
   * Browsers refuse audio until the page has real user activation, and
   * dwelling, scrolling and heading for the tab bar are none of them. So we
   * build the audio context on the first genuine gesture and simply stay
   * SILENT when there hasn't been one — a cold first visit opens quietly
   * rather than pretending to chime. WebAudio rather than a file: nothing
   * to download, nothing to host, and no request on someone else's site.
   */
  var audio = null;
  function armAudio() {
    if (audio) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audio = new Ctx();
    } catch (e) { audio = null; }
  }
  ["pointerdown", "mousedown", "click", "keydown", "touchstart", "touchend"].forEach(function (evt) {
    window.addEventListener(evt, armAudio, { once: true, passive: true, capture: true });
  });

  function chime() {
    if (!cfg.sound) return;
    // Our script tag is async, so the visitor may well have clicked BEFORE
    // it arrived — in which case our own gesture listeners never fired but
    // the page is nonetheless activated and audio is allowed. Ask the
    // browser rather than relying only on what we happened to observe.
    if (!audio && navigator.userActivation && navigator.userActivation.hasBeenActive) armAudio();
    if (!audio) return;

    function play() {
      if (audio.state !== "running") return; // still not permitted: stay quiet
      var now = audio.currentTime;
      [[880, 0], [1174.7, 0.12]].forEach(function (note) {
        var osc = audio.createOscillator();
        var gain = audio.createGain();
        osc.type = "sine";
        osc.frequency.value = note[0];
        // Short and quiet on purpose — a notification, not an alarm.
        gain.gain.setValueAtTime(0.0001, now + note[1]);
        gain.gain.exponentialRampToValueAtTime(0.06, now + note[1] + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + note[1] + 0.22);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(now + note[1]);
        osc.stop(now + note[1] + 0.24);
      });
    }

    try {
      // resume() is ASYNC. Checking state on the next line finds it still
      // "suspended" and skips the sound entirely — which is exactly how a
      // chime ships as permanently silent. Wait for it.
      if (audio.state === "suspended") audio.resume().then(play).catch(function () {});
      else play();
    } catch (e) { /* silence is an acceptable outcome */ }
  }

  function dropShell() {
    if (shell && shell.parentNode) shell.parentNode.removeChild(shell);
    shell = null;
  }

  function toggle() {
    open = !open;
    if (open) {
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (e) { /* private mode */ }
      if (!frame) {
        // Something branded on screen NOW; the frame arrives underneath it.
        shell = buildShell();
        document.body.appendChild(shell);

        frame = document.createElement("iframe");
        // The page the visitor opened the chat FROM — the assistant greets in
        // context ("Looking at Logo Design?") and retrieval favors this page.
        frame.src =
          origin + "/widget/" + encodeURIComponent(token) +
          "?page=" + encodeURIComponent(location.origin + location.pathname);
        frame.title = "Chat";
        // Voice input. A cross-origin iframe gets NO microphone unless the host
        // page delegates it here — without this the mic button is dead on every
        // customer site, however the permission is set inside. Delegating is not
        // granting: the browser still asks the visitor, once, on first use.
        frame.allow = "microphone";
        // NOT the frame's load event: that can fire before the document
        // inside has painted, which would flash the blank panel we are here
        // to prevent. The chat itself says when it is on screen. The timeout
        // is the backstop so a failed frame never strands anyone.
        setTimeout(dropShell, 6000);
        document.body.appendChild(frame);
      }
    } else {
      dropShell();
    }
    sizeFrame();
    btn.setAttribute("aria-label", open ? "Close chat" : "Open chat");
  }

  /**
   * Open once, unprompted, when someone lingers, reads deep, or moves to
   * leave — and never again that session. A panel that reopens itself is an
   * advert, not an assistant.
   */
  function armProactive() {
    if (!cfg.proactive) return;
    try { if (sessionStorage.getItem(SESSION_KEY)) return; } catch (e) { /* private mode */ }
    var fired = false;
    function fire() {
      if (fired || open) return;
      fired = true;
      cleanup();
      toggle();
      chime(); // only here — a visitor who clicked doesn't need telling
    }
    function onScroll() {
      var h = document.documentElement;
      var max = (h.scrollHeight || 0) - (h.clientHeight || 0);
      if (max > 0 && (h.scrollTop || document.body.scrollTop) / max > 0.5) fire();
    }
    function onLeave(e) { if (e.clientY <= 0) fire(); }
    var timer = setTimeout(fire, Math.max(3, cfg.proactiveDelay) * 1000);
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseout", onLeave);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("mouseout", onLeave);
  }

  btn.addEventListener("click", toggle);
  window.addEventListener("resize", sizeFrame);
  // The iframe asks to be closed (its own X button on phones).
  window.addEventListener("message", function (e) {
    if (e.origin !== origin) return;
    if (e.data === "topezia:ready") dropShell();
    if (e.data === "topezia:close" && open) toggle();
  });
  document.body.appendChild(btn);

  /**
   * One small cached call: the launcher's colour, and everything the
   * placeholder panel needs. Failure is not a problem — the default
   * gradient is already on screen and the chat still opens.
   */
  try {
    fetch(origin + "/api/widget/" + encodeURIComponent(token) + "/config")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) {
        if (!c || !c.enabled) return;
        cfg = {
          accent: c.accent || null,
          name: c.name || "",
          logo: c.logo || null,
          greeting: c.greeting || "",
          proactive: !!c.proactive,
          proactiveDelay: c.proactiveDelay || 20,
          sound: !!c.sound,
        };
        if (cfg.accent && /^#[0-9a-f]{6}$/i.test(cfg.accent)) {
          grad = "linear-gradient(135deg," + cfg.accent + "," + shade(cfg.accent) + ")";
          btn.style.background = grad;
        }
        armProactive();
      })
      .catch(function () {});
  } catch (e) { /* no fetch, no colour — the chat still works */ }
})();
