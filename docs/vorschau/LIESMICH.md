# Vorschauen, die noch nicht freigegeben sind

Jede Datei `<name>.patch` hier ist eine fertige Änderung, die der Auftraggeber erst lokal
ansehen will, bevor sie übernommen wird. Sie ist NICHT im Code eingespielt.

Ansehen auf dem eigenen Rechner:

    cd ~/nikki-demo && git pull && bash scripts/demo-lokal.sh <name>

Das Skript spielt die Vorschau nur in eine eigene Kopie unter `~/.nikki-vorschau/<name>` ein
und startet dort die Demo (http://localhost:8080, Ein-Klick-Login unter /__vorschau).
Der Ordner `~/nikki-demo` bleibt unverändert, `live-bringen.sh` überträgt nur den Code aus Git:
eine Vorschau kann also nicht aus Versehen live gehen.

Nach der Freigabe wird die Änderung richtig eingespielt und die Datei hier gelöscht.

| Vorschau | Inhalt |
|---|---|
| `usecases` | Zwei neue Use Cases auf TikTok: Omid Mouazzen (@nikkiclips1, 1,3 Mio. Views in 8 Tagen) und Islam Dulatov (@kavkazkibiror, 1 Mio. Views), als Case-Study-Karten auf der Startseite und in der Kundenleiste. Bei Omid zeigen die drei Kacheln die Vorschaubilder der drei ausgewählten TikTok-Videos und öffnen sie per Klick. |
| (erledigt) | `dashboards` wurde am 07.11.2026 freigegeben und ist eingespielt. |
