#!/usr/bin/env python3
"""
SEO- und GEO-Prüfung aller öffentlichen Seiten von Nikki Media.

  SEO  = klassische Suchmaschinen (Google, Bing)
  GEO  = Generative Engine Optimization: Antworten von ChatGPT, Perplexity,
         Google AI Overviews & Co. Die lesen strukturierte Daten (JSON-LD),
         klare Fakten, FAQ und /llms.txt; dazu kommt die geografische
         Ausrichtung auf den DACH-Raum (hreflang, areaServed).

Verwendung
  python3 tools/seo_audit.py                          prüft http://127.0.0.1:8799
  python3 tools/seo_audit.py https://nikkimedia.co    prüft live (nur lesend)
  python3 tools/seo_audit.py --strict                 Exit-Code 1 bei Fehlern

Läuft gegen `python3 tools/preview.py serve`. Nur Standardbibliothek.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

PAGES = ["/", "/clipper", "/creator", "/brands", "/agenturen", "/personal-brands", "/investoren",
         "/fachartikel"]
# Impressum und Datenschutz tragen bewusst noindex und werden nicht geprüft.

TITLE = (30, 65)
DESC = (110, 165)
DACH = {"DE", "AT", "CH"}


class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lang = ""
        self.title = ""
        self.meta: dict[str, str] = {}
        self.links: list[dict[str, str]] = []
        self.hrefs: list[str] = []
        self.h1 = 0
        self.h2 = 0
        self.imgs_no_alt = 0
        self.jsonld: list[str] = []
        self._in: str | None = None
        self._buf = ""

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag == "html":
            self.lang = a.get("lang", "")
        elif tag == "title":
            self._in, self._buf = "title", ""
        elif tag == "meta":
            key = a.get("name") or a.get("property")
            if key:
                self.meta[key.lower()] = a.get("content", "")
        elif tag == "link":
            self.links.append(a)
        elif tag == "a" and a.get("href"):
            self.hrefs.append(a["href"])
        elif tag == "h1":
            self.h1 += 1
        elif tag == "h2":
            self.h2 += 1
        elif tag == "img" and "alt" not in a:
            self.imgs_no_alt += 1
        elif tag == "script" and a.get("type") == "application/ld+json":
            self._in, self._buf = "ld", ""

    def handle_endtag(self, tag):
        if self._in == "title" and tag == "title":
            self.title, self._in = self._buf.strip(), None
        elif self._in == "ld" and tag == "script":
            self.jsonld.append(self._buf)
            self._in = None

    def handle_data(self, data):
        if self._in:
            self._buf += data


def fetch(url: str) -> tuple[int, str, dict]:
    req = urllib.request.Request(url, headers={"User-Agent": "nikki-seo-audit/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, res.read().decode("utf-8", "replace"), dict(res.headers)
    except urllib.error.HTTPError as e:
        return e.code, "", {}


def ld_types(blocks: list[str]) -> tuple[set[str], list[str], list[dict]]:
    types: set[str] = set()
    errors: list[str] = []
    nodes: list[dict] = []

    def walk(node):
        if isinstance(node, dict):
            t = node.get("@type")
            for x in (t if isinstance(t, list) else [t]):
                if x:
                    types.add(x)
            nodes.append(node)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    for raw in blocks:
        try:
            walk(json.loads(raw))
        except json.JSONDecodeError as e:
            errors.append(f"JSON-LD ungültig: {e}")
    return types, errors, nodes


def audit(base: str) -> int:
    fails = warns = 0
    print(f"SEO/GEO-Prüfung gegen {base}\n")

    def report(level: str, msg: str):
        nonlocal fails, warns
        if level == "F":
            fails += 1
            print(f"    \x1b[31m✘ {msg}\x1b[0m")
        else:
            warns += 1
            print(f"    \x1b[33m• {msg}\x1b[0m")

    # Site-weite Dateien
    print("  Site")
    st, robots, _ = fetch(base + "/robots.txt")
    if st != 200 or "Sitemap:" not in robots:
        report("F", "robots.txt fehlt oder nennt keine Sitemap")
    for bot in ("GPTBot", "OAI-SearchBot", "PerplexityBot", "ClaudeBot", "Google-Extended"):
        if bot not in robots:
            report("W", f"robots.txt: {bot} nicht ausdrücklich geregelt (GEO)")
    st, sitemap, _ = fetch(base + "/sitemap.xml")
    sitemap_urls = set(re.findall(r"<loc>([^<]+)</loc>", sitemap))
    if st != 200 or not sitemap_urls:
        report("F", "sitemap.xml fehlt oder ist leer")
    if sitemap and "<lastmod>" not in sitemap:
        report("W", "sitemap.xml ohne <lastmod>")
    st, llms, _ = fetch(base + "/llms.txt")
    if st != 200 or len(llms) < 300:
        report("F", "llms.txt fehlt oder ist zu kurz (GEO)")
    articles = sorted({h for h in re.findall(r"/fachartikel/[a-z0-9-]+", sitemap)})

    for path in PAGES + articles[:3]:
        st, html, headers = fetch(base + path)
        print(f"\n  {path}  (HTTP {st})")
        if st != 200:
            report("F" if path not in ("/impressum", "/datenschutz", "/agb") else "W", f"HTTP {st}")
            continue
        p = Page()
        p.feed(html)
        if not p.lang.startswith("de"):
            report("F", f'<html lang="{p.lang}"> statt de')
        if not (TITLE[0] <= len(p.title) <= TITLE[1]):
            report("W", f"Titel {len(p.title)} Zeichen (ideal {TITLE[0]}–{TITLE[1]}): {p.title!r}")
        desc = p.meta.get("description", "")
        if not desc:
            report("F", "meta description fehlt")
        elif not (DESC[0] <= len(desc) <= DESC[1]):
            report("W", f"Description {len(desc)} Zeichen (ideal {DESC[0]}–{DESC[1]})")
        if p.h1 != 1:
            report("F", f"{p.h1}× <h1> (genau eine erwartet)")
        if p.h2 < 2 and not path.startswith("/fachartikel/"):
            report("W", f"nur {p.h2} <h2>, wenig Gliederung")
        canon = [l.get("href") for l in p.links if l.get("rel") == "canonical"]
        if not canon:
            report("F", "kein rel=canonical")
        alts = {l.get("hreflang") for l in p.links if l.get("rel") == "alternate" and l.get("hreflang")}
        if not {"de-DE", "de-AT", "de-CH"} <= alts:
            report("W", f"hreflang für DACH unvollständig: {sorted(a for a in alts if a)}")
        if "x-default" not in alts:
            report("W", "kein hreflang x-default")
        for key in ("og:title", "og:description", "og:image", "og:url", "twitter:card"):
            if key not in p.meta:
                report("W", f"{key} fehlt")
        if p.meta.get("robots", "").startswith("noindex"):
            report("F", "noindex auf öffentlicher Seite")
        if p.imgs_no_alt:
            report("W", f"{p.imgs_no_alt} Bilder ohne alt")
        types, errs, nodes = ld_types(p.jsonld)
        for e in errs:
            report("F", e)
        if not types:
            report("F", "keine strukturierten Daten (JSON-LD)")
        else:
            print(f"    JSON-LD: {', '.join(sorted(types))}")
        if "Organization" not in types and "ProfessionalService" not in types and "Article" not in types:
            report("W", "Organization fehlt im JSON-LD (Entität für Suchmaschinen und KI)")
        if path.startswith("/fachartikel/"):
            for t in ("Article", "BreadcrumbList", "Person"):
                if t not in types:
                    report("W", f"Artikel ohne {t} (E-E-A-T / GEO)")
        served = set()
        for n in nodes:
            area = n.get("areaServed")
            for a in (area if isinstance(area, list) else [area]):
                if isinstance(a, dict):
                    served.add(a.get("name") or a.get("identifier"))
                elif a:
                    served.add(a)
        if path in ("/", "/brands", "/agenturen", "/personal-brands") and not ({"DE", "AT", "CH", "Deutschland", "Österreich", "Schweiz"} & served):
            report("W", "areaServed DACH fehlt (geografische Ausrichtung)")
        if canon and canon[0] and urlparse(canon[0]).path not in {urlparse(u).path for u in sitemap_urls} and path != "/fachartikel":
            report("W", f"Canonical nicht in sitemap.xml: {canon[0]}")

    print(f"\n{'✓' if not fails else '✘'} {fails} Fehler, {warns} Hinweise")
    return fails


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    base = (args[0] if args else "http://127.0.0.1:8799").rstrip("/")
    n = audit(base)
    sys.exit(1 if n and "--strict" in sys.argv else 0)
