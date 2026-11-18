# Rechenwerk

Wissenschaftlicher Taschenrechner als PWA mit der Tastenanordnung eines klassischen Schulrechners.
Offline, ohne Werbung, alle Farbschemata frei.

## Lokal starten

```bash
python3 -m http.server 8765 --directory ~/Dokumente/Taschenrechner
```

Dann <http://localhost:8765> öffnen.

## Aufs Handy

**Als APK:** `./build-apk.sh` baut eine signierte Offline-APK (Capacitor) und legt sie unter
`Google Drive/Rechenwerk/Rechenwerk.apk` ab. Der Signierschlüssel liegt in `~/Android/keys`
und darf nicht verloren gehen, sonst lassen sich Updates nicht mehr installieren.

**Als PWA:** <https://steidlmichael2000-stack.github.io/rechenwerk/> in Chrome öffnen,
Menü → **Zum Startbildschirm hinzufügen**. Danach läuft sie offline.

## Bedienung

| Taste | Funktion |
|---|---|
| **SHIFT** / **ALPHA** | gelbe / rote Zweitbelegung |
| **▪⁄▫** | Bruch, z. B. `1⁄2 + 1⁄3` → ⁵⁄₆ |
| **S⇔D** | exakt (Bruch, √, π) ↔ Dezimal |
| **SHIFT =** | sofort Dezimalergebnis (≈) |
| **∫** | `∫(f(x); a; b)`, Trenner `;` über SHIFT **)** |
| **SHIFT ∫** | `d/dx(f(x); Stelle)` |
| **SHIFT (−)** | log (Basis 10), Haupttaste log▪▫ ist log mit Basis |
| **SHIFT Ans** | % |
| **ALPHA DEL** | UNDO |
| **ALPHA × ÷ + −** | GCD, LCM, Int, Intg |
| **STO** + Variablentaste | Ergebnis in A–F, x, Y, M speichern |
| **RCL** | Variablenliste |
| **▲ ▼** | durch frühere Rechnungen blättern |
| **MENU** | Verlauf, Winkeleinheit, Aussehen, Komma |

Implizite Multiplikation bindet stärker als ÷: `1÷2π` = 1/(2π).

Dezimalkomma und `;` als Trenner
sind Standard (umstellbar im MENU).

Noch nicht umgesetzt (zeigen einen Hinweis): CALC, SOLVE, CONST, CONV, Pol/Rec, ∠, °′″, INS, QR, ÷R,
RndFix, i.

## Dateien

- `calc.js` – Rechenkern (Parser, Auswertung, exakte Darstellung)
- `app.js` – Tastenfeld, Anzeige, Einstellungen
- `style.css` – Aussehen und Farbschemata
- `sw.js` – Offline-Cache (bei Änderungen `VERSION` hochzählen)
- `make-icons.py` – erzeugt die Icons (PWA und Android)
- `build-apk.sh` – baut die APK und legt sie in Google Drive ab
