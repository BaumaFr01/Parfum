"use strict";

/* -------------------- Konfiguration -------------------- */

const LOCATION = {
  name: "Leinzell",
  plz: "73575",
  // Fallback-Koordinaten (falls Geocoding-API nicht erreichbar ist)
  fallbackLat: 48.8494,
  fallbackLon: 9.8792,
};

const STORAGE_KEY = "parfum-liste";

const WEATHER_CODES = {
  0: ["Klarer Himmel", "☀️"],
  1: ["Überwiegend klar", "🌤️"],
  2: ["Teilweise bewölkt", "⛅"],
  3: ["Bedeckt", "☁️"],
  45: ["Nebel", "🌫️"],
  48: ["Reifnebel", "🌫️"],
  51: ["Leichter Nieselregen", "🌦️"],
  53: ["Nieselregen", "🌦️"],
  55: ["Starker Nieselregen", "🌧️"],
  56: ["Gefrierender Nieselregen", "🌧️"],
  57: ["Starker gefrierender Nieselregen", "🌧️"],
  61: ["Leichter Regen", "🌦️"],
  63: ["Regen", "🌧️"],
  65: ["Starker Regen", "🌧️"],
  66: ["Gefrierender Regen", "🌨️"],
  67: ["Starker gefrierender Regen", "🌨️"],
  71: ["Leichter Schneefall", "🌨️"],
  73: ["Schneefall", "❄️"],
  75: ["Starker Schneefall", "❄️"],
  77: ["Schneekörner", "❄️"],
  80: ["Leichte Regenschauer", "🌦️"],
  81: ["Regenschauer", "🌧️"],
  82: ["Heftige Regenschauer", "⛈️"],
  85: ["Leichte Schneeschauer", "🌨️"],
  86: ["Starke Schneeschauer", "❄️"],
  95: ["Gewitter", "⛈️"],
  96: ["Gewitter mit Hagel", "⛈️"],
  99: ["Starkes Gewitter mit Hagel", "⛈️"],
};

/* -------------------- Zustand -------------------- */

let perfumes = loadPerfumes();
let currentTemp = null;

/* -------------------- Persistenz -------------------- */

function loadPerfumes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePerfumes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(perfumes));
}

/* -------------------- Hilfsfunktionen -------------------- */

function normalizeOccasion(value) {
  const v = (value || "").toString().trim().toLowerCase();
  if (["buero", "büro", "office", "work", "arbeit"].includes(v)) return "buero";
  if (["freizeit", "leisure", "casual", "privat"].includes(v)) return "freizeit";
  return "beides";
}

function occasionLabel(o) {
  return { buero: "Büro", freizeit: "Freizeit", beides: "Beides" }[o] || "Beides";
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function scoreForTemp(perfume, temp) {
  if (temp >= perfume.minTemp && temp <= perfume.maxTemp) return 0;
  if (temp < perfume.minTemp) return perfume.minTemp - temp;
  return temp - perfume.maxTemp;
}

/* -------------------- CSV Parsing -------------------- */

function parseCsv(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const header = splitCsvLine(lines[0], delimiter).map((h) =>
    h.trim().toLowerCase().replace(/[^a-zäöüß]/g, "")
  );

  const colIndex = (names) => names.map((n) => header.indexOf(n)).find((i) => i >= 0);

  const idxName = colIndex(["name"]);
  const idxBrand = colIndex(["marke", "brand"]);
  const idxOccasion = colIndex(["anlass", "occasion"]);
  const idxMin = colIndex(["mintemp", "min", "minc"]);
  const idxMax = colIndex(["maxtemp", "max", "maxc"]);
  const idxNotes = colIndex(["notiz", "notes", "bemerkung"]);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delimiter);
    if (cols.every((c) => c.trim() === "")) continue;

    const name = idxName !== undefined ? cols[idxName]?.trim() : cols[0]?.trim();
    if (!name) continue;

    const minTemp = idxMin !== undefined ? parseFloat(cols[idxMin]) : NaN;
    const maxTemp = idxMax !== undefined ? parseFloat(cols[idxMax]) : NaN;

    rows.push({
      id: makeId(),
      name,
      brand: idxBrand !== undefined ? (cols[idxBrand] || "").trim() : "",
      occasion: normalizeOccasion(idxOccasion !== undefined ? cols[idxOccasion] : ""),
      minTemp: Number.isFinite(minTemp) ? minTemp : -10,
      maxTemp: Number.isFinite(maxTemp) ? maxTemp : 35,
      notes: idxNotes !== undefined ? (cols[idxNotes] || "").trim() : "",
    });
  }
  return rows;
}

function splitCsvLine(line, delimiter) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

const SAMPLE_CSV = `Name,Marke,Anlass,MinTemp,MaxTemp,Notiz
Light Blue,Dolce & Gabbana,Freizeit,18,30,Frisch-zitrisch für warme Tage
Bleu de Chanel,Chanel,Beides,10,25,Vielseitiger Holzduft
Aventus,Creed,Büro,5,20,Fruchtig-holzig und seriös
Sauvage,Dior,Freizeit,15,32,Frisch und würzig für den Sommer
Terre d'Hermès,Hermès,Büro,8,22,Erdig-mineralisch, dezent
Tobacco Vanille,Tom Ford,Beides,-5,12,Warm und würzig für kalte Tage
Acqua di Giò,Giorgio Armani,Freizeit,20,35,Leicht und aquatisch für Hitze
Le Labo Santal 33,Le Labo,Büro,0,15,Holzig-warm für kühle Bürotage
`;

/* -------------------- Rendering: Liste -------------------- */

function renderList() {
  const body = document.getElementById("perfume-table-body");
  const count = document.getElementById("list-count");
  count.textContent = perfumes.length;

  if (perfumes.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="hint">Noch keine Parfüms hinterlegt.</td></tr>`;
    return;
  }

  body.innerHTML = perfumes
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.brand || "–")}</td>
      <td><span class="tag ${p.occasion}">${occasionLabel(p.occasion)}</span></td>
      <td>${p.minTemp}°C – ${p.maxTemp}°C</td>
      <td>${escapeHtml(p.notes || "")}</td>
      <td><button class="icon-btn" data-id="${p.id}" title="Löschen">🗑️</button></td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      perfumes = perfumes.filter((p) => p.id !== btn.dataset.id);
      savePerfumes();
      renderList();
      renderRecommendations();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* -------------------- Rendering: Empfehlungen -------------------- */

function renderRecommendations() {
  const officeList = document.getElementById("office-list");
  const leisureList = document.getElementById("leisure-list");

  if (currentTemp === null) {
    officeList.innerHTML = `<li class="hint">Warte auf Wetterdaten…</li>`;
    leisureList.innerHTML = `<li class="hint">Warte auf Wetterdaten…</li>`;
    return;
  }

  renderColumn(officeList, "buero", "office");
  renderColumn(leisureList, "freizeit", "leisure");
}

function renderColumn(listEl, occasionFilter, cssClass) {
  const candidates = perfumes
    .filter((p) => p.occasion === occasionFilter || p.occasion === "beides")
    .map((p) => ({ ...p, score: scoreForTemp(p, currentTemp) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  if (candidates.length === 0) {
    listEl.innerHTML = `<li class="hint">Kein passendes Parfüm in der Liste hinterlegt.</li>`;
    return;
  }

  listEl.innerHTML = candidates
    .map((p, i) => {
      const badge = p.score === 0 ? "Perfekt" : `±${Math.ceil(p.score)}°C`;
      return `
      <li class="perfume-chip ${cssClass} ${i === 0 ? "best" : ""}">
        <div class="p-name">${escapeHtml(p.name)}<span class="p-badge">${badge}</span></div>
        <div class="p-meta">${escapeHtml(p.brand || "")} · ${p.minTemp}°C–${p.maxTemp}°C${
        p.notes ? " · " + escapeHtml(p.notes) : ""
      }</div>
      </li>`;
    })
    .join("");
}

/* -------------------- Wetter -------------------- */

async function fetchCoordinates() {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        LOCATION.name
      )}&count=10&language=de&format=json`
    );
    if (!res.ok) throw new Error("Geocoding fehlgeschlagen");
    const data = await res.json();
    const match = (data.results || []).find(
      (r) =>
        r.country_code === "DE" &&
        (r.admin1 === "Baden-Württemberg" || (r.postcodes || []).includes(LOCATION.plz))
    );
    if (match) return { lat: match.latitude, lon: match.longitude };
  } catch (e) {
    console.warn("Geocoding nicht verfügbar, nutze Fallback-Koordinaten.", e);
  }
  return { lat: LOCATION.fallbackLat, lon: LOCATION.fallbackLon };
}

async function fetchWeather() {
  const content = document.getElementById("weather-content");
  content.innerHTML = `<p class="hint">Wetterdaten werden geladen…</p>`;

  try {
    const { lat, lon } = await fetchCoordinates();
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weathercode,wind_speed_10m,relative_humidity_2m` +
        `&timezone=Europe%2FBerlin`
    );
    if (!res.ok) throw new Error("Wetterdaten konnten nicht geladen werden");
    const data = await res.json();
    const current = data.current;

    currentTemp = current.temperature_2m;
    const [desc, icon] = WEATHER_CODES[current.weathercode] || ["Unbekannt", "🌡️"];

    content.innerHTML = `
      <div class="weather-icon">${icon}</div>
      <div class="weather-temp">${currentTemp.toFixed(1)}°C</div>
      <div class="weather-details">
        <div>${desc}</div>
        <div>💧 Luftfeuchtigkeit: ${current.relative_humidity_2m}%</div>
        <div>💨 Wind: ${current.wind_speed_10m} km/h</div>
        <div>📍 ${LOCATION.name} (${LOCATION.plz})</div>
      </div>`;

    renderRecommendations();
  } catch (e) {
    console.error(e);
    content.innerHTML = `<p class="weather-error">⚠️ Wetterdaten konnten nicht geladen werden. Bitte später erneut versuchen.</p>`;
  }
}

/* -------------------- Event-Handler -------------------- */

document.getElementById("refresh-weather-btn").addEventListener("click", fetchWeather);

document.getElementById("csv-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const parsed = parseCsv(text);
  const status = document.getElementById("upload-status");

  if (parsed.length === 0) {
    status.textContent = "Es konnten keine gültigen Einträge aus der Datei gelesen werden.";
    return;
  }

  perfumes = perfumes.concat(parsed);
  savePerfumes();
  renderList();
  renderRecommendations();
  status.textContent = `${parsed.length} Parfüm(s) aus "${file.name}" hinzugefügt.`;
  e.target.value = "";
});

document.getElementById("load-sample-btn").addEventListener("click", () => {
  const parsed = parseCsv(SAMPLE_CSV);
  perfumes = perfumes.concat(parsed);
  savePerfumes();
  renderList();
  renderRecommendations();
  document.getElementById("upload-status").textContent = `${parsed.length} Beispiel-Parfüms hinzugefügt.`;
});

document.getElementById("clear-list-btn").addEventListener("click", () => {
  if (perfumes.length === 0) return;
  if (!confirm("Wirklich die gesamte Parfüm-Liste löschen?")) return;
  perfumes = [];
  savePerfumes();
  renderList();
  renderRecommendations();
});

document.getElementById("add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("f-name").value.trim();
  const brand = document.getElementById("f-brand").value.trim();
  const occasion = document.getElementById("f-occasion").value;
  const minTemp = parseFloat(document.getElementById("f-min").value);
  const maxTemp = parseFloat(document.getElementById("f-max").value);
  const notes = document.getElementById("f-notes").value.trim();

  if (!name || !Number.isFinite(minTemp) || !Number.isFinite(maxTemp)) return;
  if (minTemp > maxTemp) {
    alert("Min-Temperatur muss kleiner oder gleich der Max-Temperatur sein.");
    return;
  }

  perfumes.push({ id: makeId(), name, brand, occasion, minTemp, maxTemp, notes });
  savePerfumes();
  renderList();
  renderRecommendations();
  e.target.reset();
});

/* -------------------- Initialisierung -------------------- */

renderList();
renderRecommendations();
fetchWeather();
