# Parfüm-Wetter-Berater

Eine kleine, clientseitige Webapp, die anhand der aktuellen Wetterdaten für **73575 Leinzell** das passende Parfüm empfiehlt – getrennt nach **Büro** und **Freizeit**.

## Nutzung

Es ist kein Build-Prozess oder Server nötig. Einfach `index.html` im Browser öffnen, oder das Verzeichnis mit einem beliebigen statischen Webserver ausliefern, z. B.:

```bash
python3 -m http.server 8000
```

und dann `http://localhost:8000` aufrufen.

## Funktionen

- **Parfüm-Liste hochladen**: CSV-Datei mit den Spalten `Name,Marke,Anlass,MinTemp,MaxTemp,Notiz` (Trennzeichen `,` oder `;`). Eine Beispieldatei liegt unter [`beispiel-parfuems.csv`](./beispiel-parfuems.csv), oder per Klick auf "Beispiel laden" direkt in der App.
- **Aktuelles Wetter**: Ruft automatisch die aktuellen Wetterdaten für Leinzell (73575) über die kostenlose [Open-Meteo](https://open-meteo.com/) API ab (kein API-Key nötig).
- **Empfehlungen**: Zeigt je 3 passende Parfüms für Büro und Freizeit an, sortiert nach bester Übereinstimmung mit der aktuellen Temperatur.
- Parfüms können außerdem manuell über ein Formular hinzugefügt oder aus der Liste gelöscht werden. Die Liste wird im Browser (`localStorage`) gespeichert.

## Anlass-Werte in der CSV

- `Büro` – nur für die Bürospalte
- `Freizeit` – nur für die Freizeitspalte
- `Beides` – erscheint in beiden Spalten
