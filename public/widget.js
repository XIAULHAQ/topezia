/**
 * Topezia chat widget loader — the ONLY file a customer's site runs.
 *
 * One script tag:
 *   <script src="https://www.topezia.com/widget.js" data-topezia="SITE_TOKEN" async></script>
 *
 * Everything real happens inside an iframe on our origin; this file just
 * draws the bubble and the frame. No dependencies, no cookies, no reading of
 * the host page. Kept dumb on purpose: this code runs on someone else's
 * website, where our bugs become their bugs.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var token = script.getAttribute("data-topezia");
  if (!token || !/^[A-Za-z0-9_-]{10,64}$/.test(token)) return;
  var origin = new URL(script.src).origin;

  var open = false;
  var frame = null;

  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Open chat");
  btn.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M4 4h16v12H7l-3 3z"/></svg>';
  btn.style.cssText =
    "position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;" +
    "background:linear-gradient(135deg,#8B5CF6,#3B82F6);box-shadow:0 8px 24px rgba(59,60,246,.35);" +
    "display:flex;align-items:center;justify-content:center;z-index:2147483000;";

  function toggle() {
    open = !open;
    if (open && !frame) {
      frame = document.createElement("iframe");
      frame.src = origin + "/widget/" + encodeURIComponent(token);
      frame.title = "Chat";
      frame.style.cssText =
        "position:fixed;right:20px;bottom:88px;width:380px;height:560px;max-width:calc(100vw - 24px);" +
        "max-height:calc(100vh - 110px);border:none;border-radius:16px;z-index:2147483000;" +
        "box-shadow:0 12px 48px rgba(15,23,42,.28);background:#fff;";
      document.body.appendChild(frame);
    }
    if (frame) frame.style.display = open ? "block" : "none";
    btn.setAttribute("aria-label", open ? "Close chat" : "Open chat");
  }

  btn.addEventListener("click", toggle);
  document.body.appendChild(btn);
})();
