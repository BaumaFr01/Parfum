# cache-band

Schmale Leiste direkt über dem Eingabefeld von Claude Code:

1. Restzeit des Prompt-Caches (5 min oder 1 h, aus dem Session-Transcript gemessen) mit 20-Kästchen-Balken: grün, im letzten Viertel gelb, in den letzten 10 % rot, bei 0 „abgelaufen“.
2. Cache-Hit-Rate der letzten Antwort.
3. Kontext-Wetter: ☀️ bis zur Hälfte der Auto-Compact-Schwelle, 🌧️ bis 80 %, ⛈️ darüber.
4. Kontextfüllung in Prozent und Auto-Compact-Schwelle (Fallback 83 %, mit `*` markiert).
5. Button „Compact“ (bei ⛈️ hervorgehoben); in der Desktop App oder während Claude arbeitet wird `/compact` eingereiht.
6. Pfeil zum Zuklappen (dann nur Wetter, Cache-Restzeit, Kontext-%).
7. Nach `/compact` oder dem Button: Tokens vorher → nachher und die Zusammenfassung als Log-Zeilen im Chat (vom Modell nicht gelesen), an Absätzen aufgeteilt.

## Installation (alle Projekte)

Direkt vom Branch:

```
claude plugin marketplace add "https://github.com/BaumaFr01/Parfum.git#claude/cache-monitor-mod-7n7ho1"
claude plugin install cache-band@baumafr01-mods --scope user
```

Nach dem Merge in den Standard-Branch reicht `claude plugin marketplace add BaumaFr01/Parfum`.
In der Desktop App: + neben dem Eingabefeld → Plugins → Add marketplace, dann Add plugin.
