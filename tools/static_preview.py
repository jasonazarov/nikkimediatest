#!/usr/bin/env python3
"""
Klickbare Demo als statische Seiten: nimmt jede Seite der laufenden Vorschau
(tools/preview.py serve) so auf, wie sie im Browser FERTIG geladen aussieht
(Views-Grafik, virale Clips, Menüs), und verlinkt die Seiten untereinander.

Das Ergebnis läuft ohne Server, z. B. als geteilter Link. Navigation, Menü,
Suche im Menü und Schubladen funktionieren; Speichern, Hochladen und Absenden
sind abgeschaltet (es gibt keinen Server dahinter).

    python3 tools/preview.py serve            # in einem zweiten Terminal
    python3 tools/static_preview.py <ausgabeordner>

Braucht playwright und beautifulsoup4.
"""

from __future__ import annotations

import re
import shutil
import sys
from collections import deque
from pathlib import Path
from urllib.parse import urldefrag, urlparse

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = "http://127.0.0.1:8799"
TOKENS = dict(l.split("=", 1) for l in (ROOT / ".wrangler/preview-state/tokens.txt").read_text().split())

# Rolle → (Startseiten, erlaubter Pfadanfang, höchstens so viele Seiten)
CRAWL = {
    "admin": (["/admin", "/admin/analytics", "/admin/projekte", "/admin/clipper", "/admin/creator", "/admin/kunden",
               "/admin/leads", "/admin/agenturen", "/admin/fachartikel", "/admin/fachartikel/neu", "/admin/upsells"], "/admin", 34),
    "customer": (["/app", "/app/videos", "/app/einstellungen"], "/app", 12),
    "clipper": (["/work", "/work/upload"], "/work", 8),
    "creator": (["/kampagnen", "/kampagnen/meine", "/kampagnen/finden", "/kampagnen/verbreiten", "/kampagnen/upload",
                 "/kampagnen/accounts"], "/kampagnen", 14),
    "agency": (["/collaboration", "/collaboration/kampagnen", "/collaboration/creator", "/collaboration/clipper",
                "/collaboration/meine", "/collaboration/buchungen", "/collaboration/preise", "/collaboration/neu"], "/collaboration", 16),
    None: (["/", "/agenturen", "/personal-brands", "/investoren", "/clipper", "/creator", "/brands", "/fachartikel",
            "/login", "/impressum", "/datenschutz"], "/fachartikel", 20),
}
SKIP = re.compile(r"^/(api|media|logout)|/download|\.(mp4|mov|zip)$")

BANNER = """
<style>.rv{opacity:1!important;transform:none!important}</style>
<div id="nmprev" style="position:fixed;z-index:99999;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:10px;align-items:center;padding:8px 8px 8px 14px;border-radius:99px;background:rgba(4,12,8,.92);border:1px solid rgba(47,224,140,.45);box-shadow:0 10px 30px rgba(0,0,0,.6);font:600 13px/1.2 system-ui,sans-serif;color:#eef7f1;backdrop-filter:blur(10px);max-width:calc(100vw - 24px)">
  <span style="white-space:nowrap">Vorschau · Testdaten</span>
  <a href="index.html" style="padding:7px 12px;border-radius:99px;background:#2fe08c;color:#02160c;text-decoration:none;white-space:nowrap">Rolle wechseln</a>
</div>
<div id="nmtoast" hidden style="position:fixed;z-index:99999;left:50%;top:18px;transform:translateX(-50%);padding:10px 16px;border-radius:12px;background:#111;border:1px solid rgba(255,255,255,.15);font:500 13px/1.3 system-ui,sans-serif;color:#eef7f1;max-width:calc(100vw - 32px)">In der Vorschau abgeschaltet: hier wird nichts gespeichert.</div>
<script>
(function () {
  var t = document.getElementById('nmtoast'), h;
  function toast() { t.hidden = false; clearTimeout(h); h = setTimeout(function () { t.hidden = true; }, 2600); }
  document.addEventListener('submit', function (e) { e.preventDefault(); toast(); }, true);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-off]');
    if (a) { e.preventDefault(); toast(); }
  }, true);
  var f = window.fetch;
  window.fetch = function () { toast(); return Promise.reject(new Error('Vorschau')); };
})();
</script>"""


def fname(role: str | None, path: str) -> str:
    """'/admin/projekte/p-0' → 'admin__admin-projekte-p-0.html' (Rolle im Namen, weil / und /app je Rolle anders aussehen)."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", path.strip("/")) or "start"
    return f"{role or 'web'}__{slug}.html"


def main(out: Path) -> None:
    if out.exists():
        shutil.rmtree(out)
    (out / "assets").mkdir(parents=True)
    pages: dict[tuple[str | None, str], str] = {}  # (rolle, pfad) → html
    assets: set[str] = set()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        for role, (seeds, prefix, limit) in CRAWL.items():
            ctx = browser.new_context(viewport={"width": 1280, "height": 860}, timezone_id="Europe/Berlin",
                                      reduced_motion="reduce")  # Zähler und Balken zeigen sofort ihren Endwert
            if role:
                ctx.add_cookies([{"name": f"nm_session_{role}", "value": TOKENS[role], "url": BASE}])
            page = ctx.new_page()
            queue, seen = deque(seeds), set()
            while queue and len([k for k in pages if k[0] == role]) < limit:
                path = queue.popleft()
                if path in seen:
                    continue
                seen.add(path)
                res = page.goto(BASE + path, wait_until="networkidle")
                if not res or res.status != 200 or urlparse(page.url).path != path:
                    continue
                page.wait_for_timeout(700)
                # Einmal durchscrollen: Balken und Zähler starten erst, wenn sie ins Bild kommen.
                page.evaluate("""async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 180)); } window.scrollTo(0, 0); }""")
                page.wait_for_timeout(2200)
                page.evaluate("document.querySelectorAll('.nma').forEach(e => e.remove())")
                pages[(role, path)] = page.content()
                for href in page.eval_on_selector_all("a[href]", "els => els.map(e => e.getAttribute('href'))"):
                    h = urldefrag(href)[0]
                    if h.startswith("/") and h.startswith(prefix) and not SKIP.search(h) and "?" not in h and h not in seen:
                        queue.append(h)
                print(f"  {role or 'web':9} {path}")
            ctx.close()
        browser.close()

    captured = {k: fname(*k) for k in pages}
    public = {p: f for (r, p), f in captured.items() if r is None}

    for (role, path), html in pages.items():
        soup = BeautifulSoup(html, "html.parser")
        for s in soup.find_all("script", src=True):
            s.decompose()  # Daten-Skripte würden die fertig gerenderten Inhalte überschreiben
        for img in soup.find_all("img"):
            if not img.get("src"):
                img.decompose()  # Vorschaubilder, die erst ein Skript lädt: ohne Server leer
        own = {p: f for (r, p), f in captured.items() if r == role}

        def target(url: str) -> str | None:
            base, frag = urldefrag(url)
            if not base:
                return url
            if not base.startswith("/") or base.startswith("//"):
                return url  # extern
            if base.startswith(("/assets/", "/img/")):
                assets.add(base)
                return base.lstrip("/") + (f"#{frag}" if frag else "")
            f = own.get(base) or public.get(base)
            return (f + (f"#{frag}" if frag else "")) if f else None

        for tag, attr in (("a", "href"), ("link", "href"), ("img", "src"), ("source", "src"), ("form", "action")):
            for el in soup.find_all(tag, **{attr: True}):
                new = target(el[attr])
                if new is None:
                    if tag == "a":
                        el["href"] = "#"
                        el["data-off"] = "1"
                    elif tag == "img":
                        el.decompose()
                    else:
                        el[attr] = "#"
                else:
                    el[attr] = new
        for el in soup.select('a[target="_blank"]'):
            if not el.get("href", "").startswith("http"):
                del el["target"]
        body = soup.body
        if body:
            body.append(BeautifulSoup(BANNER, "html.parser"))
        (out / captured[(role, path)]).write_text(str(soup), encoding="utf-8")

    # Stylesheets und Bilder, inklusive der Bilder, auf die die CSS-Dateien zeigen
    for a in sorted(assets):
        src = ROOT / "public" / a.lstrip("/")
        if not src.is_file():
            continue
        dst = out / a.lstrip("/")
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.suffix == ".css":
            css = src.read_text(encoding="utf-8")
            for ref in re.findall(r"url\(['\"]?(/(?:img|assets)/[^)'\"]+)", css):
                img = ROOT / "public" / ref.lstrip("/")
                if img.is_file():
                    (out / ref.lstrip("/")).parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy(img, out / ref.lstrip("/"))
            css = re.sub(r"url\((['\"]?)/(img|assets)/", r"url(\1../\2/", css)
            dst.write_text(css, encoding="utf-8")
        else:
            shutil.copy(src, dst)

    total = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"✓ {len(pages)} Seiten, {len(assets)} Dateien, {total / 1e6:.1f} MB in {out}")
    (out / "pages.txt").write_text("\n".join(f"{r or 'web'}\t{p}\t{f}" for (r, p), f in captured.items()), encoding="utf-8")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / ".wrangler" / "static-preview")
