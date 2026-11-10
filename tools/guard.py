#!/usr/bin/env python3
"""
Backend-Wächter: beweist, dass eine optische Überarbeitung keine Abläufe bricht.

Vergleicht zwei Git-Stände (Standard: Ausgangsstand-Commit gegen Arbeitsverzeichnis)
und meldet alles, was WEGGEFALLEN ist an:

  routes      Routen (app.get/post/put/delete/patch …) in src/
  api         aufgerufene Endpunkte (fetch('/api/…'), action="/…")
  fields      Formularfelder: name="…"
  ids         id="…" (JavaScript greift darüber auf Elemente zu)
  data        data-…-Attribute (Haken für assets/*.js und Inline-Skripte)
  schema      Tabellen und Spalten in migrations/*.sql
  files       Dateien in src/, public/assets/, migrations/

Neu Hinzugekommenes wird nur gezählt, nicht beanstandet: Ergänzen ist erlaubt,
Entfernen oder Umbenennen nicht (Regeln aus 05_FUSIONS_REGELN.md).

Verwendung
  python3 tools/guard.py                      Ausgangsstand = erster Commit
  python3 tools/guard.py <commit>             gegen einen bestimmten Commit
  python3 tools/guard.py <alt> <neu>          zwei Commits

Exit-Code 1, wenn etwas weggefallen ist. Nur Standardbibliothek.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCAN = ("src/", "public/assets/", "migrations/")
TEXT = (".ts", ".js", ".sql", ".css")

PATTERNS = {
    "routes": re.compile(r"""\b\w+(?:Routes|Api|app)\.(get|post|put|delete|patch|all)\(\s*['"`]([^'"`]+)['"`]"""),
    "api": re.compile(r"""(?:fetch\(\s*|action=["']|data-endpoint=["']|href=["'])(/(?:api|login|logout|media)[^"'`\s?${]*)"""),
    "fields": re.compile(r"""\bname=["']([a-zA-Z_][\w\-\[\]]*)["']"""),
    "ids": re.compile(r"""\bid=["']([a-zA-Z][\w\-:.]*)["']"""),
    "data": re.compile(r"""\b(data-[a-z][a-z0-9\-]*)"""),
}
TABLE = re.compile(r"CREATE TABLE\s+[`\"]?(\w+)[`\"]?\s*\((.*?)\);", re.S | re.I)
ALTER = re.compile(r"ALTER TABLE\s+[`\"]?(\w+)[`\"]?\s+ADD(?: COLUMN)?\s+[`\"]?(\w+)", re.I)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def files_at(rev: str | None) -> dict[str, str]:
    """Pfad → Inhalt aller geprüften Dateien, für einen Commit oder das Arbeitsverzeichnis."""
    out: dict[str, str] = {}
    if rev is None:
        for base in SCAN:
            for p in (ROOT / base).rglob("*"):
                if p.is_file() and p.suffix in TEXT and p.name != "tw.css":
                    out[str(p.relative_to(ROOT))] = p.read_text(encoding="utf-8", errors="replace")
        return out
    for path in git("ls-tree", "-r", "--name-only", rev).splitlines():
        if path.startswith(SCAN) and path.endswith(TEXT) and not path.endswith("tw.css"):
            out[path] = git("show", f"{rev}:{path}")
    return out


def inventory(files: dict[str, str]) -> dict[str, set[str]]:
    inv: dict[str, set[str]] = {k: set() for k in (*PATTERNS, "schema", "files")}
    for path, text in files.items():
        inv["files"].add(path)
        for key, rx in PATTERNS.items():
            for m in rx.finditer(text):
                if key == "routes":
                    inv[key].add(f"{m.group(1).upper()} {m.group(2)}  ({Path(path).name})")
                else:
                    inv[key].add(m.group(1))
        if path.endswith(".sql"):
            for t, body in TABLE.findall(text):
                inv["schema"].add(t)
                for line in body.splitlines():
                    col = re.match(r"\s*[`\"]?(\w+)[`\"]?\s+(text|integer|real|blob|numeric)", line, re.I)
                    if col:
                        inv["schema"].add(f"{t}.{col.group(1)}")
            for t, c in ALTER.findall(text):
                inv["schema"].add(f"{t}.{c}")
    return inv


# Bewusst entfernt, auf ausdrückliche Vorgabe des Auftraggebers. Steht hier mit
# Grund, damit der Wächter nur UNGEWOLLTE Verluste meldet.
BEWUSST_ENTFERNT: dict[str, dict[str, str]] = {
    "ids": {
        # November 2026: Creator legen Kampagnen im selben Formular an wie Agentur
        # und Kunde (/kampagnen/neu). Das alte Namensfenster der Übersicht fällt weg.
        "campaign-modal": "Creator: gemeinsames Kampagnen-Formular",
        "campaign-name": "Creator: gemeinsames Kampagnen-Formular",
        "campaign-error": "Creator: gemeinsames Kampagnen-Formular",
        "campaign-save": "Creator: gemeinsames Kampagnen-Formular",
    },
}


def main() -> int:
    args = sys.argv[1:]
    old = args[0] if args else git("rev-list", "--max-parents=0", "HEAD").split()[0]
    new = args[1] if len(args) > 1 else None
    print(f"Backend-Wächter: {old[:10]} → {new[:10] if new else 'Arbeitsverzeichnis'}\n")
    a, b = inventory(files_at(old)), inventory(files_at(new))
    removed_total = 0
    for key in ("routes", "api", "fields", "ids", "data", "schema", "files"):
        allowed = BEWUSST_ENTFERNT.get(key, {})
        gone = sorted(g for g in a[key] - b[key] if g not in allowed)
        added = len(b[key] - a[key])
        removed_total += len(gone)
        mark = "\x1b[32m✓\x1b[0m" if not gone else "\x1b[31m✘\x1b[0m"
        print(f"  {mark} {key:7} {len(a[key]):5} vorher · {len(b[key]):5} jetzt · {added:3} neu · {len(gone)} entfernt")
        for g in gone[:40]:
            print(f"        − {g}")
    print()
    if removed_total:
        print(f"\x1b[31m✘ {removed_total} Haken entfernt oder umbenannt. Prüfen, bevor das live geht.\x1b[0m")
        return 1
    print("\x1b[32m✓ Nichts entfernt: alle Routen, Endpunkte, Formularfelder, IDs, data-Attribute und Spalten sind noch da.\x1b[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
