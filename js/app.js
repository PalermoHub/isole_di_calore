const CONFIG_URL = "dati/lst_palermo_config.json";
const YEARS_STATS_URL = "dati/lst_years_stats.json";
const TREND_URL = "dati/lst_trend.json";
let LST_TREND = null;
let CITY_BAND = null;
let RESIDUI_SCATTER = null;
const PMTILES_SEZIONI_YEARS = "pmtiles://dati/geo/sezioni_lst_years.pmtiles";
const PMTILES_AGGREGATI_YEARS = "pmtiles://dati/geo/aggregati_lst_years.pmtiles";
const PMTILES_SEZIONI_RESIDUI = "pmtiles://dati/geo/sezioni_residui.pmtiles";
const PMTILES_SEZIONI_DENSVIA = "pmtiles://dati/geo/sezioni_lst_densvia.pmtiles";
const PMTILES_AGGREGATI_DENSVIA = "pmtiles://dati/geo/aggregati_lst_densvia.pmtiles";
const RESIDUI_STATS_URL = "dati/residui_stats.json";
const DENSVIA_STATS_URL = "dati/lst_densvia_stats.json";
let DENSVIA_SCATTER = null;
const GEO_SEARCH_URL = "dati/geo_search.json";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// --- Tema chiaro/scuro ---
const THEME_KEY = "sup_temp_estiva_theme";
const BASEMAP_TILES = {
  light: [
    "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  ],
  dark: [
    "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  ],
};
function isDarkTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) return saved === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function applyThemeAttr(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const btn = document.getElementById("btn-theme");
  if (btn) btn.classList.toggle("active", dark);
}

// scala divergente (blu = piu' fresco dell'atteso, rosso = piu' caldo dell'atteso), centrata su 0
const RESIDUI_BREAKS = [-10, -5, -2, -0.5, 0.5, 2, 5, 10];
const RESIDUI_COLORS = ["#2166ac", "#67a9cf", "#d1e5f0", "#f7f7f7", "#fddbc7", "#ef8a62", "#b2182b"];

// giallo→arancio→rosso (x: LST 2025) incrociato con chiaro→scuro (y: trend 2019→2025)
const PAL = {
  "1-1": "#efe5b3", "2-1": "#efcfb3", "3-1": "#efb7b3",
  "1-2": "#e9ce49", "2-2": "#e99449", "3-2": "#e95449",
  "1-3": "#ae9309", "2-3": "#ae5609", "3-3": "#ae1409",
};
const NO_DATA_COLOR = "#cccccc";
const ROW_LABELS = ["Alta", "Media", "Bassa"]; // val_y, alto→basso dall'alto
const COL_LABELS = ["Bassa", "Media", "Alta"]; // val_x, basso→alto da sinistra

const BIVAR_VARIANTS = {
  trend: {
    labelX: "LST 2025", unitX: "°C",
    labelY: "Variazione 2019→2025", unitY: "°C",
    axisX: "LST 2025 (°C) →",
    axisY: "Variazione 2019→2025 (°C) ↑",
    def: `Ogni sezione incrocia due valori: quanto è <strong>calda ora</strong>
      (LST 2025, asse orizzontale) e quanto si è <strong>riscaldata dal 2019</strong>
      (variazione, asse verticale). Colori chiari = stabile e fresco; rosso scuro =
      già caldo e in ulteriore peggioramento — le isole di calore più critiche.`,
  },
  densvia: {
    labelX: "LST 2025", unitX: "°C",
    labelY: "Densità viaria", unitY: "km/km²",
    axisX: "LST 2025 (°C) →",
    axisY: "Densità viaria (km/km²) ↑",
    def: `Ogni sezione incrocia due valori: quanto è <strong>calda ora</strong>
      (LST 2025, asse orizzontale) e quanta <strong>rete stradale</strong> ha
      (densità viaria, asse verticale). Rosso scuro = zone calde e ad alta densità
      di strade — dove asfalto e traffico si sommano al calore.`,
  },
};
let bivariateVariant = "densvia";

// ColorBrewer YlOrRd sequenziale, k = 3..9
const YLORRD = {
  3: ["#ffeda0", "#feb24c", "#f03b20"],
  4: ["#ffffb2", "#fecc5c", "#fd8d3c", "#e31a1c"],
  5: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"],
  6: ["#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"],
  7: ["#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#b10026"],
  8: ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#b10026"],
  9: ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#bd0026", "#800026"],
};

const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const ALL_LEVELS = ["sezioni", "quartieri", "circoscrizioni", "upl"];
const LEVEL_NAME_FIELD = { sezioni: "sez", quartieri: "Quartiere", circoscrizioni: "circoscrizione", upl: "UPL" };

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

function fillColorExpression(field) {
  const expr = ["match", ["get", field]];
  for (const [k, v] of Object.entries(PAL)) {
    expr.push(k, v);
  }
  expr.push(NO_DATA_COLOR);
  return expr;
}

// --- Classificazione per le mappe LST anno-per-anno ---

function computeBreaks(values, method, k) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (method === "equal") {
    const breaks = [min];
    for (let i = 1; i <= k; i++) breaks.push(min + ((max - min) * i) / k);
    return breaks;
  }
  if (method === "quantile") {
    const breaks = [min];
    for (let i = 1; i < k; i++) breaks.push(ss.quantile(values, i / k));
    breaks.push(max);
    return breaks;
  }
  // jenks (natural breaks) via ckmeans — non può generare più classi dei valori disponibili
  const kEff = Math.min(k, values.length);
  const clusters = ss.ckmeans(values, kEff);
  const breaks = [min];
  for (let i = 0; i < clusters.length - 1; i++) breaks.push(clusters[i][clusters[i].length - 1]);
  breaks.push(max);
  return breaks;
}

function lstColorExpression(field, breaks, colors) {
  const stepArgs = [];
  for (let i = 1; i < breaks.length - 1; i++) {
    stepArgs.push(breaks[i], colors[i]);
  }
  return [
    "case",
    ["==", ["get", field], null],
    NO_DATA_COLOR,
    ["step", ["get", field], colors[0], ...stepArgs],
  ];
}

function renderLstLegend(breaks, colors, activeIdx) {
  const wrap = document.getElementById("lst-legend");
  wrap.innerHTML = "";
  for (let i = 0; i < colors.length; i++) {
    const sw = document.createElement("div");
    sw.className = "lst-legend-swatch";
    if (activeIdx != null) sw.classList.add(activeIdx === i ? "active" : "dimmed");
    sw.style.background = colors[i];
    sw.dataset.idx = i;
    sw.title = `${breaks[i].toFixed(1)} – ${breaks[i + 1].toFixed(1)} °C`;
    wrap.appendChild(sw);
  }
  document.getElementById("lst-legend-min").textContent = `${breaks[0].toFixed(1)} °C`;
  document.getElementById("lst-legend-max").textContent = `${breaks[breaks.length - 1].toFixed(1)} °C`;
}

function residuiColorExpression(field) {
  const stepArgs = [];
  for (let i = 1; i < RESIDUI_BREAKS.length - 1; i++) {
    stepArgs.push(RESIDUI_BREAKS[i], RESIDUI_COLORS[i]);
  }
  return [
    "case",
    ["==", ["get", field], null],
    NO_DATA_COLOR,
    ["step", ["get", field], RESIDUI_COLORS[0], ...stepArgs],
  ];
}

function renderResiduiLegend(activeIdx) {
  const wrap = document.getElementById("residui-legend");
  wrap.innerHTML = "";
  for (let i = 0; i < RESIDUI_COLORS.length; i++) {
    const sw = document.createElement("div");
    sw.className = "lst-legend-swatch";
    if (activeIdx != null) sw.classList.add(activeIdx === i ? "active" : "dimmed");
    sw.style.background = RESIDUI_COLORS[i];
    sw.dataset.idx = i;
    sw.title = `${RESIDUI_BREAKS[i]} – ${RESIDUI_BREAKS[i + 1]} °C`;
    wrap.appendChild(sw);
  }
  document.getElementById("residui-legend-min").textContent = "più fresco →";
  document.getElementById("residui-legend-max").textContent = "→ più caldo";
}

function showResiduiInfo(props) {
  const box = document.getElementById("residui-info-box");
  box.textContent = "";
  if (!props) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Clic su una sezione per i dettagli.";
    box.appendChild(hint);
    return;
  }
  const title = document.createElement("div");
  title.className = "info-title";
  title.textContent = `Sezione ${props.sez}`;
  box.appendChild(title);

  const residuo = props.residuo_lst != null ? Number(props.residuo_lst) : null;
  if (residuo != null) {
    const badge = document.createElement("span");
    badge.className = residuo >= 0 ? "trend-badge trend-badge-bad" : "trend-badge trend-badge-good";
    badge.textContent = `${residuo >= 0 ? "▲" : "▼"} ${residuo >= 0 ? "Più calda" : "Più fresca"} di ${Math.abs(residuo).toFixed(1)} °C rispetto all'atteso`;
    box.appendChild(badge);
  }
  box.appendChild(makeRow("LST 2025 osservata", props.LST_2025 != null ? `${Number(props.LST_2025).toFixed(2)} °C` : "—"));
  box.appendChild(makeRow("LST prevista (morfologia)", props.LST_predetta != null ? `${Number(props.LST_predetta).toFixed(2)} °C` : "—"));
  box.appendChild(makeRow("Quartiere", props.Quartiere ?? "—"));
  box.appendChild(makeRow("Quota media", props.quota_media != null ? `${Number(props.quota_media).toFixed(1)} m` : "—"));
  box.appendChild(makeRow("Pendenza media", props.pendenza_media != null ? `${Number(props.pendenza_media).toFixed(1)}°` : "—"));
  box.appendChild(makeRow("SVF medio", props.svf_medio != null ? Number(props.svf_medio).toFixed(3) : "—"));
  box.appendChild(makeRow("Densità viaria", props.densita_viaria_km_kmq != null ? `${Number(props.densita_viaria_km_kmq).toFixed(1)} km/kmq` : "—"));
  box.appendChild(makeRow("Area impermeabile stradale", props.area_impermeabile_stradale_pct != null ? `${Number(props.area_impermeabile_stradale_pct).toFixed(1)} %` : "—"));

  if (RESIDUI_SCATTER) {
    const predetta = props.LST_predetta != null ? Number(props.LST_predetta) : null;
    const osservata = props.LST_2025 != null ? Number(props.LST_2025) : null;
    const highlight = predetta != null && osservata != null ? { x: predetta, y: osservata } : null;
    const title = document.createElement("div");
    title.className = "info-title trend-title";
    title.textContent = "Osservata vs. prevista (tutte le sezioni)";
    box.appendChild(title);
    box.appendChild(renderResiduiScatter(RESIDUI_SCATTER, highlight, residuo != null && residuo >= 0));
  }
}

function renderBivariateScatter(points, highlight, xLabel, yLabel) {
  const W = 300, H = 180, padL = 34, padR = 8, padT = 8, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const xs = points.map((p) => p[0]).concat(highlight ? [highlight.x] : []);
  const ys = points.map((p) => p[1]).concat(highlight ? [highlight.y] : []);
  const xMin0 = Math.min(...xs), xMax0 = Math.max(...xs);
  const yMin0 = Math.min(...ys), yMax0 = Math.max(...ys);
  const xPad = (xMax0 - xMin0) * 0.08 || 1;
  const yPad = (yMax0 - yMin0) * 0.08 || 1;
  const xMin = xMin0 - xPad, xMax = xMax0 + xPad;
  const yMin = yMin0 - yPad, yMax = yMax0 + yPad;

  const x = (v) => padL + (plotW * (v - xMin)) / (xMax - xMin);
  const y = (v) => padT + plotH - (plotH * (v - yMin)) / (yMax - yMin);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.classList.add("trend-chart");

  const gridG = document.createElementNS(svgNS, "g");
  gridG.setAttribute("class", "trend-grid");
  [yMin, (yMin + yMax) / 2, yMax].forEach((v) => {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", padL); line.setAttribute("x2", W - padR);
    line.setAttribute("y1", y(v).toFixed(1)); line.setAttribute("y2", y(v).toFixed(1));
    gridG.appendChild(line);
    const lbl = document.createElementNS(svgNS, "text");
    lbl.setAttribute("x", padL - 4); lbl.setAttribute("y", (y(v) + 3).toFixed(1));
    lbl.setAttribute("text-anchor", "end");
    lbl.textContent = v.toFixed(0);
    gridG.appendChild(lbl);
  });
  svg.appendChild(gridG);

  const dotsG = document.createElementNS(svgNS, "g");
  points.forEach(([px, py]) => {
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", x(px).toFixed(1)); c.setAttribute("cy", y(py).toFixed(1));
    c.setAttribute("r", 1.6);
    c.setAttribute("class", "scatter-dot-bg");
    dotsG.appendChild(c);
  });
  svg.appendChild(dotsG);

  if (highlight) {
    const hc = document.createElementNS(svgNS, "circle");
    hc.setAttribute("cx", x(highlight.x).toFixed(1)); hc.setAttribute("cy", y(highlight.y).toFixed(1));
    hc.setAttribute("r", 5);
    hc.setAttribute("class", "trend-dot trend-dot-biv");
    svg.appendChild(hc);
  }

  const xLbl = document.createElementNS(svgNS, "text");
  xLbl.setAttribute("x", padL + plotW / 2); xLbl.setAttribute("y", H - 3);
  xLbl.setAttribute("text-anchor", "middle");
  xLbl.setAttribute("class", "trend-x-lbl");
  xLbl.textContent = xLabel;
  svg.appendChild(xLbl);

  const wrap = document.createElement("div");
  wrap.className = "trend-chart-wrap";
  wrap.appendChild(svg);

  const legend = document.createElement("div");
  legend.className = "trend-legend";
  const legendItem = (swatchClass, label) => {
    const item = document.createElement("span");
    item.className = "trend-legend-item";
    const sw = document.createElement("i");
    sw.className = `trend-swatch ${swatchClass}`;
    item.append(sw, document.createTextNode(label));
    return item;
  };
  legend.append(legendItem("scatter-swatch-bg", "Tutte le sezioni"));
  wrap.appendChild(legend);

  const hint = document.createElement("p");
  hint.className = "trend-hint";
  hint.textContent = highlight
    ? `Ogni punto è una sezione censuaria. Asse orizzontale: ${xLabel}; asse verticale: ${yLabel}.`
    : "Sezione senza dati sufficienti per il grafico.";
  wrap.appendChild(hint);

  return wrap;
}

let activeBivLbl = null;
const bivCells = {};

function buildLegend(onCellClick) {
  const grid = document.getElementById("legend-grid");
  grid.innerHTML = "";
  for (let y = 3; y >= 1; y--) {
    const rh = document.createElement("div");
    rh.className = "legend-row-hdr";
    rh.textContent = ROW_LABELS[3 - y];
    grid.appendChild(rh);

    for (let x = 1; x <= 3; x++) {
      const lbl = `${x}-${y}`;
      const cell = document.createElement("div");
      cell.className = "legend-cell";
      cell.style.background = PAL[lbl];
      const v0 = BIVAR_VARIANTS[bivariateVariant];
      cell.title = `${v0.labelX} ${COL_LABELS[x - 1]} · ${v0.labelY} ${ROW_LABELS[3 - y]}`;
      cell.addEventListener("click", () => {
        activeBivLbl = activeBivLbl === lbl ? null : lbl;
        Object.values(bivCells).forEach((c) => c.classList.remove("active"));
        if (activeBivLbl) cell.classList.add("active");
        onCellClick(activeBivLbl);
      });
      bivCells[lbl] = cell;
      grid.appendChild(cell);
    }
  }
}

function updateBivariateLegendText() {
  const v = BIVAR_VARIANTS[bivariateVariant];
  document.getElementById("biv-axis-y-lbl").textContent = v.axisY;
  document.getElementById("biv-axis-x-lbl").textContent = v.axisX;
  document.getElementById("biv-def").innerHTML = v.def;
  for (let y = 3; y >= 1; y--) {
    for (let x = 1; x <= 3; x++) {
      const lbl = `${x}-${y}`;
      const cell = bivCells[lbl];
      if (cell) cell.title = `${v.labelX} ${COL_LABELS[x - 1]} · ${v.labelY} ${ROW_LABELS[3 - y]}`;
    }
  }
}

function makeRow(label, value) {
  const row = document.createElement("div");
  row.className = "info-row";
  const l = document.createElement("span");
  l.textContent = label;
  const v = document.createElement("span");
  v.textContent = value;
  row.append(l, v);
  return row;
}

function buildTrendHintText(years, label, first, last, delta, worsening, cityBand) {
  const y0 = years[0], y1 = years[years.length - 1];
  const who = label || "Questa zona";
  if (delta == null) return `${who}: dati insufficienti per calcolare l'andamento ${y0}–${y1}.`;

  const trendPart = worsening
    ? `si è scaldata di ${delta} °C tra il ${y0} e il ${y1}`
    : `si è raffreddata di ${Math.abs(delta)} °C tra il ${y0} e il ${y1}`;

  const cityLast = cityBand.median[cityBand.median.length - 1];
  let comparePart = "";
  if (cityLast != null && last != null) {
    const diffCity = +(last - cityLast).toFixed(1);
    if (Math.abs(diffCity) < 0.1) {
      comparePart = ` Nel ${y1} è in linea con la mediana di Palermo.`;
    } else {
      comparePart = ` Nel ${y1} è ${Math.abs(diffCity)} °C ${diffCity > 0 ? "più calda" : "più fresca"} della mediana di Palermo.`;
    }
  }
  return `${who} ${trendPart}.${comparePart}`;
}

function renderTrendChart(years, series, cityBand, label) {
  const W = 300, H = 130, padL = 30, padR = 8, padT = 22, padB = 18;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const allVals = [...series, ...cityBand.p25, ...cityBand.p75].filter((v) => v != null);
  const min = Math.min(...allVals), max = Math.max(...allVals);
  const pad = (max - min) * 0.12 || 1;
  const yMin = min - pad, yMax = max + pad;

  const x = (i) => padL + (plotW * i) / (years.length - 1);
  const y = (v) => padT + plotH - (plotH * (v - yMin)) / (yMax - yMin);
  const pathOf = (arr) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const bandPath =
    cityBand.p75.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ") +
    " " +
    cityBand.p25.map((v, i) => `L${x(years.length - 1 - i).toFixed(1)},${y(cityBand.p25[years.length - 1 - i]).toFixed(1)}`).join(" ") +
    " Z";

  const first = series.find((v) => v != null);
  const last = [...series].reverse().find((v) => v != null);
  const delta = first != null && last != null ? (last - first).toFixed(1) : null;
  const worsening = delta != null && Number(delta) > 0;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.classList.add("trend-chart");

  const gridG = document.createElementNS(svgNS, "g");
  gridG.setAttribute("class", "trend-grid");
  [yMin, (yMin + yMax) / 2, yMax].forEach((v) => {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", padL); line.setAttribute("x2", W - padR);
    line.setAttribute("y1", y(v).toFixed(1)); line.setAttribute("y2", y(v).toFixed(1));
    gridG.appendChild(line);
    const lbl = document.createElementNS(svgNS, "text");
    lbl.setAttribute("x", padL - 4); lbl.setAttribute("y", (y(v) + 3).toFixed(1));
    lbl.setAttribute("text-anchor", "end");
    lbl.textContent = v.toFixed(0);
    gridG.appendChild(lbl);
  });
  svg.appendChild(gridG);

  const band = document.createElementNS(svgNS, "path");
  band.setAttribute("d", bandPath);
  band.setAttribute("class", "trend-band");
  svg.appendChild(band);

  const medianLine = document.createElementNS(svgNS, "path");
  medianLine.setAttribute("d", pathOf(cityBand.median));
  medianLine.setAttribute("class", "trend-city-line");
  svg.appendChild(medianLine);

  const seriesLine = document.createElementNS(svgNS, "path");
  seriesLine.setAttribute("d", pathOf(series));
  seriesLine.setAttribute("class", worsening ? "trend-line trend-line-bad" : "trend-line trend-line-good");
  svg.appendChild(seriesLine);

  years.forEach((yr, i) => {
    const lbl = document.createElementNS(svgNS, "text");
    lbl.setAttribute("x", x(i).toFixed(1)); lbl.setAttribute("y", H - 2);
    lbl.setAttribute("text-anchor", "middle");
    lbl.setAttribute("class", "trend-x-lbl");
    lbl.textContent = yr;
    svg.appendChild(lbl);
  });

  const guideLine = document.createElementNS(svgNS, "line");
  guideLine.setAttribute("y1", padT); guideLine.setAttribute("y2", H - padB);
  guideLine.setAttribute("class", "trend-guide");
  guideLine.style.display = "none";
  svg.appendChild(guideLine);

  const cityDot = document.createElementNS(svgNS, "circle");
  cityDot.setAttribute("r", 3);
  cityDot.setAttribute("class", "trend-dot trend-dot-city");
  cityDot.style.display = "none";
  svg.appendChild(cityDot);

  const seriesDot = document.createElementNS(svgNS, "circle");
  seriesDot.setAttribute("r", 3);
  seriesDot.setAttribute("class", worsening ? "trend-dot trend-dot-series trend-dot-bad" : "trend-dot trend-dot-series trend-dot-good");
  seriesDot.style.display = "none";
  svg.appendChild(seriesDot);

  const hitArea = document.createElementNS(svgNS, "rect");
  hitArea.setAttribute("x", padL); hitArea.setAttribute("y", 0);
  hitArea.setAttribute("width", plotW); hitArea.setAttribute("height", H);
  hitArea.setAttribute("class", "trend-hit-area");
  svg.appendChild(hitArea);

  const wrap = document.createElement("div");
  wrap.className = "trend-chart-wrap";

  if (delta != null) {
    const badge = document.createElement("span");
    badge.className = worsening ? "trend-badge trend-badge-bad" : "trend-badge trend-badge-good";
    badge.textContent = `${worsening ? "▲" : "▼"} ${worsening ? "In peggioramento" : "In miglioramento"} ${delta > 0 ? "+" : ""}${delta} °C`;
    wrap.appendChild(badge);
  }
  wrap.appendChild(svg);

  const tooltip = document.createElement("div");
  tooltip.className = "trend-tooltip";
  tooltip.style.display = "none";
  wrap.appendChild(tooltip);

  const updateHover = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const xFrac = (clientX - rect.left) / rect.width;
    const vbX = xFrac * W;
    let idx = Math.round(((vbX - padL) / plotW) * (years.length - 1));
    idx = Math.max(0, Math.min(years.length - 1, idx));

    const gx = x(idx);
    guideLine.setAttribute("x1", gx); guideLine.setAttribute("x2", gx);
    guideLine.style.display = "block";

    const val = series[idx];
    if (val != null) {
      seriesDot.setAttribute("cx", gx); seriesDot.setAttribute("cy", y(val).toFixed(1));
      seriesDot.style.display = "block";
    } else {
      seriesDot.style.display = "none";
    }
    const cityVal = cityBand.median[idx];
    if (cityVal != null) {
      cityDot.setAttribute("cx", gx); cityDot.setAttribute("cy", y(cityVal).toFixed(1));
      cityDot.style.display = "block";
    } else {
      cityDot.style.display = "none";
    }

    tooltip.textContent = "";
    const line1 = document.createElement("div");
    line1.className = "trend-tooltip-year";
    line1.textContent = years[idx];
    const line2 = document.createElement("div");
    line2.textContent = `${label || "Qui"}: ${val != null ? Number(val).toFixed(1) + " °C" : "—"}`;
    const line3 = document.createElement("div");
    line3.className = "trend-tooltip-city";
    line3.textContent = `Mediana città: ${cityVal != null ? Number(cityVal).toFixed(1) + " °C" : "—"}`;
    tooltip.append(line1, line2, line3);

    const anchorY = val != null ? y(val) : cityVal != null ? y(cityVal) : padT;
    tooltip.style.display = "block";
    tooltip.style.left = `${(gx / W) * 100}%`;
    tooltip.style.top = `${(anchorY / H) * 100}%`;
  };

  svg.addEventListener("mousemove", (e) => updateHover(e.clientX));
  svg.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
    guideLine.style.display = "none";
    seriesDot.style.display = "none";
    cityDot.style.display = "none";
  });

  const legend = document.createElement("div");
  legend.className = "trend-legend";
  const legendItem = (swatchClass, label) => {
    const item = document.createElement("span");
    item.className = "trend-legend-item";
    const sw = document.createElement("i");
    sw.className = `trend-swatch ${swatchClass}`;
    item.append(sw, document.createTextNode(label));
    return item;
  };
  legend.append(legendItem("trend-swatch-city", "Mediana città"), legendItem("trend-swatch-band", "Intervallo P25–P75"));
  wrap.appendChild(legend);

  const hint = document.createElement("p");
  hint.className = "trend-hint";
  hint.textContent = buildTrendHintText(years, label, first, last, delta, worsening, cityBand);
  wrap.appendChild(hint);

  return wrap;
}

function renderResiduiScatter(points, highlight, worsening) {
  const W = 300, H = 180, padL = 30, padR = 8, padT = 8, padB = 20;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const allVals = points.flat().concat(highlight ? [highlight.x, highlight.y] : []);
  const min = Math.min(...allVals), max = Math.max(...allVals);
  const pad = (max - min) * 0.08 || 1;
  const vMin = min - pad, vMax = max + pad;

  const x = (v) => padL + (plotW * (v - vMin)) / (vMax - vMin);
  const y = (v) => padT + plotH - (plotH * (v - vMin)) / (vMax - vMin);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.classList.add("trend-chart");

  const gridG = document.createElementNS(svgNS, "g");
  gridG.setAttribute("class", "trend-grid");
  [vMin, (vMin + vMax) / 2, vMax].forEach((v) => {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", padL); line.setAttribute("x2", W - padR);
    line.setAttribute("y1", y(v).toFixed(1)); line.setAttribute("y2", y(v).toFixed(1));
    gridG.appendChild(line);
    const lbl = document.createElementNS(svgNS, "text");
    lbl.setAttribute("x", padL - 4); lbl.setAttribute("y", (y(v) + 3).toFixed(1));
    lbl.setAttribute("text-anchor", "end");
    lbl.textContent = v.toFixed(0);
    gridG.appendChild(lbl);
  });
  svg.appendChild(gridG);

  // diagonale 1:1 = "osservata come prevista dalla morfologia"
  const identity = document.createElementNS(svgNS, "line");
  identity.setAttribute("x1", x(vMin)); identity.setAttribute("y1", y(vMin));
  identity.setAttribute("x2", x(vMax)); identity.setAttribute("y2", y(vMax));
  identity.setAttribute("class", "trend-city-line");
  svg.appendChild(identity);

  const dotsG = document.createElementNS(svgNS, "g");
  points.forEach(([px, py]) => {
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", x(px).toFixed(1)); c.setAttribute("cy", y(py).toFixed(1));
    c.setAttribute("r", 1.6);
    c.setAttribute("class", "scatter-dot-bg");
    dotsG.appendChild(c);
  });
  svg.appendChild(dotsG);

  if (highlight) {
    const hc = document.createElementNS(svgNS, "circle");
    hc.setAttribute("cx", x(highlight.x).toFixed(1)); hc.setAttribute("cy", y(highlight.y).toFixed(1));
    hc.setAttribute("r", 5);
    hc.setAttribute("class", worsening ? "trend-dot trend-dot-bad" : "trend-dot trend-dot-good");
    svg.appendChild(hc);
  }

  const xLbl = document.createElementNS(svgNS, "text");
  xLbl.setAttribute("x", padL + plotW / 2); xLbl.setAttribute("y", H - 3);
  xLbl.setAttribute("text-anchor", "middle");
  xLbl.setAttribute("class", "trend-x-lbl");
  xLbl.textContent = "LST prevista dalla morfologia (°C)";
  svg.appendChild(xLbl);

  const wrap = document.createElement("div");
  wrap.className = "trend-chart-wrap";
  wrap.appendChild(svg);

  const legend = document.createElement("div");
  legend.className = "trend-legend";
  const legendItem = (swatchClass, label) => {
    const item = document.createElement("span");
    item.className = "trend-legend-item";
    const sw = document.createElement("i");
    sw.className = `trend-swatch ${swatchClass}`;
    item.append(sw, document.createTextNode(label));
    return item;
  };
  legend.append(
    legendItem("trend-swatch-city", "Osservata = prevista"),
    legendItem("scatter-swatch-bg", "Tutte le sezioni")
  );
  wrap.appendChild(legend);

  const hint = document.createElement("p");
  hint.className = "trend-hint";
  hint.textContent = highlight
    ? "Il punto sopra la linea = più calda del previsto, sotto = più fresca. Asse verticale: LST osservata 2025."
    : "Sezione fuori regressione: nessun punto da evidenziare.";
  wrap.appendChild(hint);

  return wrap;
}

function showInfo(props, level) {
  const box = document.getElementById("info-box");
  box.textContent = "";
  if (!props) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Clic su una sezione/quartiere per i dettagli.";
    box.appendChild(hint);
    return;
  }
  const name =
    level === "sezioni" ? `Sezione ${props.sez}` :
    level === "quartieri" ? props.Quartiere :
    level === "circoscrizioni" ? `Circoscrizione ${props.circoscrizione}` :
    props.UPL_nome;

  const vx = props.val_x != null ? Number(props.val_x).toFixed(2) : "—";
  const vy = props.val_y != null ? Number(props.val_y).toFixed(2) : "—";

  const title = document.createElement("div");
  title.className = "info-title";
  title.textContent = name ?? "—";
  box.appendChild(title);

  const bv = BIVAR_VARIANTS[bivariateVariant];
  box.appendChild(makeRow(bv.labelX, `${vx} ${bv.unitX}`));
  box.appendChild(makeRow(bv.labelY, `${vy} ${bv.unitY}`));
  if (props.n_sezioni) box.appendChild(makeRow("Sezioni aggregate", String(props.n_sezioni)));
  if (level === "sezioni") box.appendChild(makeRow("Quartiere", props.Quartiere ?? "—"));

  if (bivariateVariant === "trend" && LST_TREND && CITY_BAND) {
    const idKey =
      level === "sezioni" ? String(props.sez) :
      level === "quartieri" ? props.Quartiere :
      level === "circoscrizioni" ? props.circoscrizione :
      props.UPL_nome;
    const series = LST_TREND.levels[level]?.[idKey];
    if (series) {
      const trendTitle = document.createElement("div");
      trendTitle.className = "info-title trend-title";
      trendTitle.textContent = "Andamento LST 2019–2025";
      box.appendChild(trendTitle);
      box.appendChild(renderTrendChart(LST_TREND.years, series, CITY_BAND, name));
    }
  }

  if (bivariateVariant === "densvia" && DENSVIA_SCATTER && props.val_x != null && props.val_y != null) {
    const scatterTitle = document.createElement("div");
    scatterTitle.className = "info-title trend-title";
    scatterTitle.textContent = "LST vs. densità viaria (tutte le sezioni)";
    box.appendChild(scatterTitle);
    const highlight = { x: Number(props.val_x), y: Number(props.val_y) };
    box.appendChild(renderBivariateScatter(DENSVIA_SCATTER, highlight, bv.axisX, bv.axisY));
  }
}

function showLstInfo(props, level, year) {
  const box = document.getElementById("lst-info-box");
  box.textContent = "";
  if (!props) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Clic su una sezione/quartiere per i dettagli.";
    box.appendChild(hint);
    return;
  }
  const nameField = LEVEL_NAME_FIELD[level];
  const name = level === "sezioni" ? `Sezione ${props[nameField]}` : props[nameField];
  const val = props[`LST_${year}`];

  const title = document.createElement("div");
  title.className = "info-title";
  title.textContent = name ?? "—";
  box.appendChild(title);

  box.appendChild(makeRow(`LST ${year}`, val != null ? `${Number(val).toFixed(2)} °C` : "—"));
  if (props.n_sezioni) box.appendChild(makeRow("Sezioni aggregate", String(props.n_sezioni)));

  const min = props[`LST_${year}_min`];
  const max = props[`LST_${year}_max`];
  const median = props[`LST_${year}_median`];
  if (min != null) box.appendChild(makeRow("Minimo", `${Number(min).toFixed(2)} °C`));
  if (max != null) box.appendChild(makeRow("Massimo", `${Number(max).toFixed(2)} °C`));
  if (val != null) box.appendChild(makeRow("Media", `${Number(val).toFixed(2)} °C`));
  if (median != null) box.appendChild(makeRow("Mediana", `${Number(median).toFixed(2)} °C`));

  if (LST_TREND && CITY_BAND) {
    const idKey = level === "sezioni" ? String(props[nameField]) : props[nameField];
    const series = LST_TREND.levels[level]?.[idKey];
    if (series) {
      const trendTitle = document.createElement("div");
      trendTitle.className = "info-title trend-title";
      trendTitle.textContent = "Andamento LST 2019–2025";
      box.appendChild(trendTitle);
      box.appendChild(renderTrendChart(LST_TREND.years, series, CITY_BAND, name));
    }
  }
}

const GEO_TYPE_LEVEL = { circ: "circoscrizioni", quart: "quartieri", upl: "upl" };
const GEO_TYPE_LABELS = { circ: "Circoscrizione", quart: "Quartiere", upl: "UPL" };

function buildGeoSuggestions(geoSearch) {
  const items = [];
  Object.entries(geoSearch.hierarchy).forEach(([circ, quarts]) => {
    items.push({ type: "circ", label: `Circoscrizione ${circ}`, value: circ });
    Object.entries(quarts).forEach(([quart, upls]) => {
      items.push({ type: "quart", label: quart, value: quart });
      upls.forEach((upl) => items.push({ type: "upl", label: upl, value: upl }));
    });
  });
  return items;
}

function highlightMatch(text, query) {
  const safe = esc(text);
  if (!query) return safe;
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return safe.replace(re, "<mark>$1</mark>");
}

// geoSearch crosswalk: risolve la condizione di filtro geografico per un livello
// territoriale qualunque, dato un geoFilter impostato a un livello diverso
// (es. filtro su un UPL applicato mentre si guarda il livello "circoscrizioni").
function geoFilterCondition(geoSearch, geoFilter, targetLevel) {
  if (!geoFilter) return null;
  const { level, value } = geoFilter;
  if (targetLevel === "sezioni") {
    const field = { circ: "circoscrizione", quart: "Quartiere", upl: "UPL_nome" }[level];
    return ["==", ["get", field], value];
  }
  if (targetLevel === "quartieri") {
    if (level === "quart") return ["==", ["get", "Quartiere"], value];
    if (level === "circ") return ["==", ["get", "circoscrizione"], value];
    const q = geoSearch.uplToQuart[value];
    return q ? ["==", ["get", "Quartiere"], q] : null;
  }
  if (targetLevel === "circoscrizioni") {
    if (level === "circ") return ["==", ["get", "circoscrizione"], value];
    const c = level === "quart" ? geoSearch.quartToCirc[value] : geoSearch.uplToCirc[value];
    return c ? ["==", ["get", "circoscrizione"], c] : null;
  }
  if (targetLevel === "upl") {
    if (level === "upl") return ["==", ["get", "UPL"], value];
    const list = level === "circ" ? geoSearch.circToUpls[value] : geoSearch.quartToUpls[value];
    return list ? ["in", ["get", "UPL"], ["literal", list]] : null;
  }
  return null;
}

function combineFilters(conds) {
  const list = conds.filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  return ["all", ...list];
}

function setupGeoSearch(geoSearch, { onSelect, onClear }) {
  const input = document.getElementById("geo-search-input");
  const clearBtn = document.getElementById("geo-search-clear");
  const dd = document.getElementById("geo-search-dd");
  const chip = document.getElementById("geo-search-chip");
  const suggestions = buildGeoSuggestions(geoSearch);

  function renderDD(query) {
    const q = query.trim().toLowerCase();
    const matches = q.length === 0 ? [] : suggestions.filter((s) => s.label.toLowerCase().includes(q)).slice(0, 12);

    if (matches.length === 0) {
      dd.innerHTML = q.length > 0 ? `<div class="geo-dd-empty">Nessun risultato per &ldquo;${esc(q)}&rdquo;</div>` : "";
      dd.classList.toggle("open", q.length > 0);
      return;
    }

    let html = "";
    let lastType = null;
    matches.forEach((m) => {
      if (m.type !== lastType) {
        html += `<div class="geo-dd-cat">${GEO_TYPE_LABELS[m.type]}</div>`;
        lastType = m.type;
      }
      html += `<div class="geo-dd-item" data-type="${esc(m.type)}" data-value="${esc(m.value)}">
                 <span>${highlightMatch(m.label, query.trim())}</span>
                 <span class="geo-dd-badge">${esc(GEO_TYPE_LABELS[m.type])}</span>
               </div>`;
    });
    dd.innerHTML = html;
    dd.classList.add("open");

    dd.querySelectorAll(".geo-dd-item").forEach((el) => {
      el.addEventListener("click", () => selectSuggestion(el.dataset.type, el.dataset.value));
    });
  }

  function selectSuggestion(type, value) {
    input.value = "";
    clearBtn.style.display = "none";
    dd.classList.remove("open");
    onSelect(type, value);
  }

  function renderChip(geoFilter) {
    if (!geoFilter) {
      chip.style.display = "none";
      chip.innerHTML = "";
      return;
    }
    const label = geoFilter.level === "circ" ? `Circoscrizione ${geoFilter.value}` : geoFilter.value;
    chip.style.display = "flex";
    chip.innerHTML = `<span class="geo-chip">${esc(GEO_TYPE_LABELS[geoFilter.level])}: ${esc(label)}<button id="geo-chip-clear" title="Rimuovi filtro">&#x2715;</button></span>`;
    document.getElementById("geo-chip-clear").addEventListener("click", onClear);
  }

  input.addEventListener("input", () => {
    clearBtn.style.display = input.value ? "" : "none";
    renderDD(input.value);
  });
  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.style.display = "none";
    dd.classList.remove("open");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#geo-search-bar") && !e.target.closest("#geo-search-dd")) dd.classList.remove("open");
  });

  return { renderChip };
}

async function main() {
  const config = await fetch(CONFIG_URL).then((r) => r.json());
  document.getElementById("subtitle").textContent = config.title;
  const yearStats = await fetch(YEARS_STATS_URL).then((r) => r.json());
  CITY_BAND = yearStats.city_band;
  LST_TREND = await fetch(TREND_URL).then((r) => r.json());
  const geoSearch = await fetch(GEO_SEARCH_URL).then((r) => r.json());
  const residuiStats = await fetch(RESIDUI_STATS_URL).then((r) => r.json());
  document.getElementById("residui-r2").textContent = residuiStats.modello.r2.toFixed(3);
  document.getElementById("residui-n").textContent = residuiStats.modello.n;
  RESIDUI_SCATTER = residuiStats.scatter;
  fetch(DENSVIA_STATS_URL)
    .then((r) => r.json())
    .then((densviaStats) => {
      DENSVIA_SCATTER = densviaStats.props.map((p) => [p.vx, p.vy]);
    })
    .catch((err) => console.error("Errore caricamento densvia scatter:", err));

  const PALERMO_CENTER = [13.353, 38.135];
  const PALERMO_ZOOM = 11;
  const PALERMO_MAX_BOUNDS = [
    [13.15, 38.02],
    [13.48, 38.27],
  ];

  let darkTheme = isDarkTheme();
  applyThemeAttr(darkTheme);

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: darkTheme ? BASEMAP_TILES.dark : BASEMAP_TILES.light,
          tileSize: 256,
          attribution: "© OpenStreetMap contributors © CARTO",
        },
        satellite: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "© Esri",
        },
      },
      layers: [
        { id: "osm", type: "raster", source: "osm" },
        { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
      ],
    },
    center: PALERMO_CENTER,
    zoom: PALERMO_ZOOM,
    minZoom: 10,
    maxZoom: 17,
    maxBounds: PALERMO_MAX_BOUNDS,
    hash: true,
    attributionControl: false,
    dragRotate: false,
    touchPitch: false,
    pitchWithRotate: false,
  });
  map.touchZoomRotate.disableRotation();

  map.addControl(new maplibregl.AttributionControl({ compact: true }));

  const bivariateLayers = () => ALL_LEVELS.flatMap((l) => [`${l}-fill`, `${l}-line`]);
  const yearLayers = () => ALL_LEVELS.flatMap((l) => [`${l}-fill-year`, `${l}-line-year`]);
  let currentLevel = "sezioni";
  let activeOverlay = "lst-years"; // "bivariate" | "lst-years" | "residui" | null

  let currentYear = 2025;
  let currentMethod = "jenks";
  let currentClasses = 5;

  // --- Filtro geografico globale (da search bar), interconnesso con i filtri
  // di classe di ogni legenda e persistente su tab/livello/overlay ---
  let geoFilter = null; // { level: "circ" | "quart" | "upl", value: string } | null
  let activeLstClassIdx = null;
  let currentLstBreaks = null;
  let activeResiduiClassIdx = null;

  function applyBivFilter() {
    const suffix = bivariateVariant === "densvia" ? "-densvia" : "";
    const field = currentLevel === "sezioni" ? "bivar_lbl" : "bivar_lbl_modale";
    const classCond = activeBivLbl ? ["==", ["get", field], activeBivLbl] : null;
    const filter = combineFilters([geoFilterCondition(geoSearch, geoFilter, currentLevel), classCond]);
    for (const suf of ["fill", "line"]) {
      const id = `${currentLevel}-${suf}${suffix}`;
      if (map.getLayer(id)) map.setFilter(id, filter);
    }
  }

  function classRangeCond(field, breaks, idx) {
    if (idx == null || !breaks) return null;
    const lo = breaks[idx];
    const hi = breaks[idx + 1];
    const isLast = idx === breaks.length - 2;
    return isLast
      ? ["all", [">=", ["get", field], lo], ["<=", ["get", field], hi]]
      : ["all", [">=", ["get", field], lo], ["<", ["get", field], hi]];
  }

  function applyLstFilter() {
    if (activeLstClassIdx != null && (!currentLstBreaks || activeLstClassIdx > currentLstBreaks.length - 2)) {
      activeLstClassIdx = null;
    }
    const field = `LST_${currentYear}`;
    const classCond = classRangeCond(field, currentLstBreaks, activeLstClassIdx);
    const filter = combineFilters([geoFilterCondition(geoSearch, geoFilter, currentLevel), classCond]);
    for (const suf of ["fill-year", "line-year"]) {
      const id = `${currentLevel}-${suf}`;
      if (map.getLayer(id)) map.setFilter(id, filter);
    }
  }

  function applyResiduiFilter() {
    const classCond = classRangeCond("residuo_lst", RESIDUI_BREAKS, activeResiduiClassIdx);
    const filter = combineFilters([geoFilterCondition(geoSearch, geoFilter, "sezioni"), classCond]);
    if (map.getLayer("sezioni-fill-residui")) map.setFilter("sezioni-fill-residui", filter);
    if (map.getLayer("sezioni-line-residui")) map.setFilter("sezioni-line-residui", filter);
  }

  function refreshAllFilters() {
    applyBivFilter();
    applyLstFilter();
    applyResiduiFilter();
  }

  function updateLayerVisibility() {
    for (const l of ALL_LEVELS) {
      const bivVisTrend = activeOverlay === "bivariate" && bivariateVariant === "trend" && l === currentLevel ? "visible" : "none";
      const bivVisDensvia = activeOverlay === "bivariate" && bivariateVariant === "densvia" && l === currentLevel ? "visible" : "none";
      const yearVis = activeOverlay === "lst-years" && l === currentLevel ? "visible" : "none";
      if (map.getLayer(`${l}-fill`)) map.setLayoutProperty(`${l}-fill`, "visibility", bivVisTrend);
      if (map.getLayer(`${l}-line`)) map.setLayoutProperty(`${l}-line`, "visibility", bivVisTrend);
      if (map.getLayer(`${l}-fill-densvia`)) map.setLayoutProperty(`${l}-fill-densvia`, "visibility", bivVisDensvia);
      if (map.getLayer(`${l}-line-densvia`)) map.setLayoutProperty(`${l}-line-densvia`, "visibility", bivVisDensvia);
      if (map.getLayer(`${l}-fill-year`)) map.setLayoutProperty(`${l}-fill-year`, "visibility", yearVis);
      if (map.getLayer(`${l}-line-year`)) map.setLayoutProperty(`${l}-line-year`, "visibility", yearVis);
    }
    const residuiVis = activeOverlay === "residui" ? "visible" : "none";
    if (map.getLayer("sezioni-fill-residui")) map.setLayoutProperty("sezioni-fill-residui", "visibility", residuiVis);
    if (map.getLayer("sezioni-line-residui")) map.setLayoutProperty("sezioni-line-residui", "visibility", residuiVis);
  }

  function setBivariateVariant(variant) {
    if (variant === bivariateVariant) return;
    bivariateVariant = variant;
    document.querySelectorAll("#bivar-variant-btns .level-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.variant === variant);
    });
    activeBivLbl = null;
    Object.values(bivCells).forEach((c) => c.classList.remove("active"));
    applyBivFilter();
    updateLayerVisibility();
    updateBivariateLegendText();
    showInfo(null);
  }

  function setBivariateEnabled(enabled) {
    if (enabled && activeOverlay !== "bivariate") setOverlay("bivariate");
    else if (!enabled && activeOverlay === "bivariate") setOverlay("lst-years");
  }

  function setLevel(level) {
    currentLevel = level;
    document.querySelectorAll("#level-btns .level-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.level === level);
    });
    updateLayerVisibility();
    activeBivLbl = null;
    activeLstClassIdx = null;
    Object.values(bivCells).forEach((c) => c.classList.remove("active"));
    applyBivFilter();
    applyLstFilter();
    if (activeOverlay === "lst-years") updateLstColors();
    showInfo(null);
    showLstInfo(null);
  }

  function updateLstColors() {
    const field = `LST_${currentYear}`;
    let legendBreaks = null;
    let legendColors = null;
    for (const level of ALL_LEVELS) {
      const values = yearStats.values[level][String(currentYear)];
      if (!values || !values.length) continue;
      const breaks = computeBreaks(values, currentMethod, currentClasses);
      const colors = YLORRD[currentClasses].slice(0, breaks.length - 1);
      const expr = lstColorExpression(field, breaks, colors);
      if (map.getLayer(`${level}-fill-year`)) map.setPaintProperty(`${level}-fill-year`, "fill-color", expr);
      if (level === currentLevel) {
        legendBreaks = breaks;
        legendColors = colors;
      }
    }
    currentLstBreaks = legendBreaks;
    if (legendBreaks) renderLstLegend(legendBreaks, legendColors, activeLstClassIdx);
    document.getElementById("lst-year-subtitle").textContent = `LST ${currentYear} (°C)`;
    applyLstFilter();
  }

  function setYear(year) {
    currentYear = year;
    document.querySelectorAll("#year-ticks .year-tick").forEach((t) => {
      t.classList.toggle("active", +t.dataset.year === year);
    });
    for (const level of ALL_LEVELS) {
      if (map.getLayer(`${level}-fill-year`)) {
        map.setLayoutProperty(`${level}-fill-year`, "visibility", activeOverlay === "lst-years" && level === currentLevel ? "visible" : "none");
      }
    }
    updateLstColors();
    showLstInfo(null);
  }

  function setOverlay(overlay) {
    activeOverlay = activeOverlay === overlay ? null : overlay;
    document.getElementById("btn-bivariate").classList.toggle("active", activeOverlay === "bivariate");
    document.getElementById("btn-lst-years").classList.toggle("active", activeOverlay === "lst-years");
    document.getElementById("btn-residui").classList.toggle("active", activeOverlay === "residui");
    document.getElementById("biv-toggle").checked = activeOverlay === "bivariate";
    document.getElementById("bivar-variant-btns").classList.toggle("disabled", activeOverlay !== "bivariate");
    document.getElementById("year-timeline").classList.toggle("hidden", activeOverlay !== "lst-years");
    document.getElementById("level-btns").parentElement.classList.toggle("hidden", activeOverlay === "residui");
    updateLayerVisibility();
    if (activeOverlay === "bivariate") { setActiveTab("bivariata"); applyBivFilter(); }
    else if (activeOverlay === "lst-years") { setActiveTab("lst-years"); updateLstColors(); }
    else if (activeOverlay === "residui") { setActiveTab("residui"); applyResiduiFilter(); }
  }

  function setActiveTab(tab) {
    document.querySelectorAll("#panel-tabs .tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.toggle("hidden", p.id !== `tab-${tab}`);
    });
    document.getElementById("level-btns").parentElement.classList.toggle("hidden", tab === "crediti" || activeOverlay === "residui");
  }

  document.getElementById("level-btns").addEventListener("click", (e) => {
    const btn = e.target.closest(".level-btn");
    if (!btn) return;
    setLevel(btn.dataset.level);
  });

  document.getElementById("panel-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    const tab = btn.dataset.tab;
    setActiveTab(tab);
    if (tab === "lst-years" && activeOverlay !== "lst-years") setOverlay("lst-years");
    if (tab === "residui" && activeOverlay !== "residui") setOverlay("residui");
    if (tab === "bivariata" && activeOverlay !== "bivariate") setOverlay("bivariate");
  });

  document.getElementById("btn-home").addEventListener("click", () => {
    map.flyTo({ center: PALERMO_CENTER, zoom: PALERMO_ZOOM });
  });

  document.getElementById("btn-satellite").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const showSat = !btn.classList.contains("active");
    btn.classList.toggle("active", showSat);
    map.setLayoutProperty("satellite", "visibility", showSat ? "visible" : "none");
    map.setLayoutProperty("osm", "visibility", showSat ? "none" : "visible");
  });

  document.getElementById("btn-bivariate").addEventListener("click", () => setOverlay("bivariate"));
  document.getElementById("btn-lst-years").addEventListener("click", () => setOverlay("lst-years"));
  document.getElementById("btn-residui").addEventListener("click", () => setOverlay("residui"));

  // --- Timeline anni ---
  const ticksEl = document.getElementById("year-ticks");
  for (const y of YEARS) {
    const t = document.createElement("div");
    t.className = "year-tick";
    t.textContent = y;
    t.dataset.year = y;
    t.addEventListener("click", () => setYear(y));
    if (y === currentYear) t.classList.add("active");
    ticksEl.appendChild(t);
  }

  let playing = false;
  let playTimer = null;
  const playBtn = document.getElementById("year-play");
  function stepYear(delta) {
    const idx = YEARS.indexOf(currentYear);
    const next = YEARS[(idx + delta + YEARS.length) % YEARS.length];
    setYear(next);
  }
  document.getElementById("year-prev").addEventListener("click", () => stepYear(-1));
  document.getElementById("year-next").addEventListener("click", () => stepYear(1));
  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.classList.toggle("active", playing);
    if (playing) {
      playTimer = setInterval(() => stepYear(1), 1200);
    } else {
      clearInterval(playTimer);
    }
  });

  document.getElementById("lst-method-btns").addEventListener("click", (e) => {
    const btn = e.target.closest(".method-btn");
    if (!btn) return;
    currentMethod = btn.dataset.method;
    document.querySelectorAll("#lst-method-btns .method-btn").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    updateLstColors();
  });
  document.getElementById("lst-classes").addEventListener("input", (e) => {
    currentClasses = +e.target.value;
    document.getElementById("lst-classes-value").textContent = currentClasses;
    updateLstColors();
  });

  const zoomSlider = document.getElementById("zoom-slider");
  const zoomValue = document.getElementById("zoom-value");
  const updateZoomControl = () => {
    const z = map.getZoom();
    zoomSlider.value = z;
    zoomValue.textContent = z.toFixed(1);
  };
  zoomSlider.addEventListener("input", () => map.setZoom(+zoomSlider.value));
  map.on("zoom", updateZoomControl);
  map.on("load", updateZoomControl);
  updateZoomControl();

  // Su schermi molto grandi PALERMO_MAX_BOUNDS può essere troppo stretto per
  // coprire il viewport allo zoom minimo (10): maplibre non lascia zoomare
  // oltre il livello che farebbe uscire il bounds dallo schermo. Allarghiamo
  // (mai restringiamo) i bounds attorno allo stesso centro finché lo zoom 10
  // non risulta sempre raggiungibile, qualunque sia la dimensione finestra.
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const invMercY = (my) => (2 * Math.atan(Math.exp(my)) - Math.PI / 2) * (180 / Math.PI);
  const boundsForZoom = (zoom, w, h, centerLon, centerLat, tileSize = 256) => {
    const scale = tileSize * 2 ** zoom;
    const lonSpan = (w / scale) * 360;
    const latSpanMerc = (h / scale) * 2 * Math.PI;
    const centerMercY = mercY(centerLat);
    return [
      [centerLon - lonSpan / 2, invMercY(centerMercY - latSpanMerc / 2)],
      [centerLon + lonSpan / 2, invMercY(centerMercY + latSpanMerc / 2)],
    ];
  };
  const syncMaxBounds = () => {
    const el = map.getContainer();
    const centerLon = (PALERMO_MAX_BOUNDS[0][0] + PALERMO_MAX_BOUNDS[1][0]) / 2;
    const centerLat = (PALERMO_MAX_BOUNDS[0][1] + PALERMO_MAX_BOUNDS[1][1]) / 2;
    const required = boundsForZoom(10, el.clientWidth, el.clientHeight, centerLon, centerLat);
    map.setMaxBounds([
      [Math.min(PALERMO_MAX_BOUNDS[0][0], required[0][0]), Math.min(PALERMO_MAX_BOUNDS[0][1], required[0][1])],
      [Math.max(PALERMO_MAX_BOUNDS[1][0], required[1][0]), Math.max(PALERMO_MAX_BOUNDS[1][1], required[1][1])],
    ]);
  };
  map.on("load", syncMaxBounds);
  map.on("resize", syncMaxBounds);

  document.getElementById("btn-fullscreen").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });
  document.addEventListener("fullscreenchange", () => {
    document.getElementById("btn-fullscreen").classList.toggle("active", !!document.fullscreenElement);
  });

  document.getElementById("btn-theme").addEventListener("click", () => {
    darkTheme = !darkTheme;
    localStorage.setItem(THEME_KEY, darkTheme ? "dark" : "light");
    applyThemeAttr(darkTheme);
    const tiles = darkTheme ? BASEMAP_TILES.dark : BASEMAP_TILES.light;
    const osmSource = map.getSource("osm");
    if (osmSource && typeof osmSource.setTiles === "function") {
      osmSource.setTiles(tiles);
    } else if (osmSource) {
      const wasVisible = map.getLayoutProperty("osm", "visibility");
      map.removeLayer("osm");
      map.removeSource("osm");
      map.addSource("osm", {
        type: "raster",
        tiles,
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
      });
      map.addLayer({ id: "osm", type: "raster", source: "osm", layout: { visibility: wasVisible || "visible" } }, "satellite");
    }
  });

  const panelEl = document.getElementById("panel");
  const panelToggle = document.getElementById("panel-toggle");
  const mapEl = document.getElementById("map");

  function setPanelOpen(open) {
    panelEl.classList.toggle("closed", !open);
    document.body.classList.toggle("panel-closed", !open);
    panelToggle.textContent = open ? "›" : "‹";
    panelToggle.title = open ? "Chiudi pannello" : "Apri pannello";
  }
  panelToggle.addEventListener("click", () => setPanelOpen(panelEl.classList.contains("closed")));
  if (window.matchMedia("(max-width: 768px)").matches) setPanelOpen(false);
  mapEl.addEventListener("transitionend", (e) => {
    if (e.propertyName === "right") map.resize();
  });

  const resizer = document.getElementById("panel-resizer");
  const PANEL_W_MIN = 350;
  const PANEL_W_MAX = 450;
  let resizing = false;
  resizer.addEventListener("pointerdown", (e) => {
    resizing = true;
    resizer.classList.add("dragging");
    resizer.setPointerCapture(e.pointerId);
  });
  resizer.addEventListener("pointermove", (e) => {
    if (!resizing) return;
    const w = Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, window.innerWidth - e.clientX));
    document.documentElement.style.setProperty("--panel-w", `${w}px`);
    map.resize();
  });
  const stopResizing = (e) => {
    if (!resizing) return;
    resizing = false;
    resizer.classList.remove("dragging");
    resizer.releasePointerCapture(e.pointerId);
  };
  resizer.addEventListener("pointerup", stopResizing);
  resizer.addEventListener("pointercancel", stopResizing);

  map.on("load", () => {
    map.addSource("sezioni", { type: "vector", url: config.pmtiles_sezioni });
    map.addSource("aggregati", { type: "vector", url: config.pmtiles_aggregati });
    map.addSource("sezioni-years", { type: "vector", url: PMTILES_SEZIONI_YEARS });
    map.addSource("aggregati-years", { type: "vector", url: PMTILES_AGGREGATI_YEARS });
    map.addSource("sezioni-residui", { type: "vector", url: PMTILES_SEZIONI_RESIDUI });
    map.addSource("sezioni-densvia", { type: "vector", url: PMTILES_SEZIONI_DENSVIA });
    map.addSource("aggregati-densvia", { type: "vector", url: PMTILES_AGGREGATI_DENSVIA });

    map.addLayer({
      id: "sezioni-fill",
      type: "fill",
      source: "sezioni",
      "source-layer": "sezioni",
      paint: { "fill-color": fillColorExpression("bivar_lbl"), "fill-opacity": 0.85 },
    });
    map.addLayer({
      id: "sezioni-line",
      type: "line",
      source: "sezioni",
      "source-layer": "sezioni",
      paint: { "line-color": "#ffffff", "line-width": 0.3 },
    });

    map.addLayer({
      id: "sezioni-fill-year",
      type: "fill",
      source: "sezioni-years",
      "source-layer": "sezioni",
      layout: { visibility: "none" },
      paint: { "fill-color": NO_DATA_COLOR, "fill-opacity": 0.85 },
    });
    map.addLayer({
      id: "sezioni-line-year",
      type: "line",
      source: "sezioni-years",
      "source-layer": "sezioni",
      layout: { visibility: "none" },
      paint: { "line-color": "#ffffff", "line-width": 0.3 },
    });

    map.addLayer({
      id: "sezioni-fill-densvia",
      type: "fill",
      source: "sezioni-densvia",
      "source-layer": "sezioni",
      layout: { visibility: "none" },
      paint: { "fill-color": fillColorExpression("bivar_lbl"), "fill-opacity": 0.85 },
    });
    map.addLayer({
      id: "sezioni-line-densvia",
      type: "line",
      source: "sezioni-densvia",
      "source-layer": "sezioni",
      layout: { visibility: "none" },
      paint: { "line-color": "#ffffff", "line-width": 0.3 },
    });

    map.addLayer({
      id: "sezioni-fill-residui",
      type: "fill",
      source: "sezioni-residui",
      "source-layer": "sezioni",
      layout: { visibility: "none" },
      paint: { "fill-color": residuiColorExpression("residuo_lst"), "fill-opacity": 0.85 },
    });
    map.addLayer({
      id: "sezioni-line-residui",
      type: "line",
      source: "sezioni-residui",
      "source-layer": "sezioni",
      layout: { visibility: "none" },
      paint: { "line-color": "#ffffff", "line-width": 0.3 },
    });

    for (const level of ["quartieri", "circoscrizioni", "upl"]) {
      map.addLayer({
        id: `${level}-fill`,
        type: "fill",
        source: "aggregati",
        "source-layer": level,
        layout: { visibility: "none" },
        paint: { "fill-color": fillColorExpression("bivar_lbl_modale"), "fill-opacity": 0.85 },
      });
      map.addLayer({
        id: `${level}-line`,
        type: "line",
        source: "aggregati",
        "source-layer": level,
        layout: { visibility: "none" },
        paint: { "line-color": "#ffffff", "line-width": 0.6 },
      });
      map.addLayer({
        id: `${level}-fill-year`,
        type: "fill",
        source: "aggregati-years",
        "source-layer": level,
        layout: { visibility: "none" },
        paint: { "fill-color": NO_DATA_COLOR, "fill-opacity": 0.85 },
      });
      map.addLayer({
        id: `${level}-line-year`,
        type: "line",
        source: "aggregati-years",
        "source-layer": level,
        layout: { visibility: "none" },
        paint: { "line-color": "#ffffff", "line-width": 0.6 },
      });
      map.addLayer({
        id: `${level}-fill-densvia`,
        type: "fill",
        source: "aggregati-densvia",
        "source-layer": level,
        layout: { visibility: "none" },
        paint: { "fill-color": fillColorExpression("bivar_lbl_modale"), "fill-opacity": 0.85 },
      });
      map.addLayer({
        id: `${level}-line-densvia`,
        type: "line",
        source: "aggregati-densvia",
        "source-layer": level,
        layout: { visibility: "none" },
        paint: { "line-color": "#ffffff", "line-width": 0.6 },
      });
    }

    const clickableLayers = ["sezioni-fill", "quartieri-fill", "circoscrizioni-fill", "upl-fill"];
    const clickableDensviaLayers = ["sezioni-fill-densvia", "quartieri-fill-densvia", "circoscrizioni-fill-densvia", "upl-fill-densvia"];
    const clickableYearLayers = ["sezioni-fill-year", "quartieri-fill-year", "circoscrizioni-fill-year", "upl-fill-year"];
    const clickableResiduiLayers = ["sezioni-fill-residui"];
    map.on("click", (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: clickableLayers });
      if (feats.length) showInfo(feats[0].properties, currentLevel);
      const densviaFeats = map.queryRenderedFeatures(e.point, { layers: clickableDensviaLayers });
      if (densviaFeats.length) showInfo(densviaFeats[0].properties, currentLevel);
      const yearFeats = map.queryRenderedFeatures(e.point, { layers: clickableYearLayers });
      if (yearFeats.length) showLstInfo(yearFeats[0].properties, currentLevel, currentYear);
      const residuiFeats = map.queryRenderedFeatures(e.point, { layers: clickableResiduiLayers });
      if (residuiFeats.length) showResiduiInfo(residuiFeats[0].properties);
    });
    const allClickable = [...clickableLayers, ...clickableDensviaLayers, ...clickableYearLayers, ...clickableResiduiLayers];
    map.on("mouseenter", allClickable, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", allClickable, () => (map.getCanvas().style.cursor = ""));

    const mapTooltipEl = document.getElementById("map-tooltip");
    function tooltipInfo(level, props, group) {
      const nameField = LEVEL_NAME_FIELD[level];
      const name = level === "sezioni" ? `Sezione ${props.sez}` : props[nameField];
      let tempLabel = "LST";
      let temp = null;
      if (group === "bivariate") {
        tempLabel = BIVAR_VARIANTS[bivariateVariant].labelX;
        temp = props.val_x != null ? `${Number(props.val_x).toFixed(2)} ${BIVAR_VARIANTS[bivariateVariant].unitX}` : null;
      } else if (group === "year") {
        tempLabel = `LST ${currentYear}`;
        const v = props[`LST_${currentYear}`];
        temp = v != null ? `${Number(v).toFixed(2)} °C` : null;
      } else if (group === "residui") {
        tempLabel = "LST 2025";
        temp = props.LST_2025 != null ? `${Number(props.LST_2025).toFixed(2)} °C` : null;
      }
      return { name, tempLabel, temp };
    }
    map.on("mousemove", (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: clickableLayers });
      const densviaFeats = feats.length ? [] : map.queryRenderedFeatures(e.point, { layers: clickableDensviaLayers });
      const yearFeats = feats.length || densviaFeats.length ? [] : map.queryRenderedFeatures(e.point, { layers: clickableYearLayers });
      const residuiFeats = feats.length || densviaFeats.length || yearFeats.length ? [] : map.queryRenderedFeatures(e.point, { layers: clickableResiduiLayers });

      let info = null;
      if (feats.length) info = tooltipInfo(currentLevel, feats[0].properties, "bivariate");
      else if (densviaFeats.length) info = tooltipInfo(currentLevel, densviaFeats[0].properties, "bivariate");
      else if (yearFeats.length) info = tooltipInfo(currentLevel, yearFeats[0].properties, "year");
      else if (residuiFeats.length) info = tooltipInfo("sezioni", residuiFeats[0].properties, "residui");

      if (!info) {
        mapTooltipEl.style.display = "none";
        return;
      }
      mapTooltipEl.textContent = "";
      const nameEl = document.createElement("div");
      nameEl.className = "map-tooltip-name";
      nameEl.textContent = info.name ?? "—";
      mapTooltipEl.appendChild(nameEl);
      if (info.temp != null) {
        const tempEl = document.createElement("div");
        tempEl.className = "map-tooltip-temp";
        tempEl.textContent = `${info.tempLabel}: ${info.temp}`;
        mapTooltipEl.appendChild(tempEl);
      }
      mapTooltipEl.style.display = "block";
      mapTooltipEl.style.left = `${e.point.x}px`;
      mapTooltipEl.style.top = `${e.point.y}px`;
    });
    map.on("mouseleave", allClickable, () => (mapTooltipEl.style.display = "none"));

    updateLayerVisibility();
    updateLstColors();
    renderResiduiLegend(activeResiduiClassIdx);
    applyResiduiFilter();
  });

  // --- Legende cliccabili → filtro per classe (interconnesso col filtro geo) ---
  document.getElementById("lst-legend").addEventListener("click", (e) => {
    const sw = e.target.closest(".lst-legend-swatch");
    if (!sw) return;
    const idx = +sw.dataset.idx;
    activeLstClassIdx = activeLstClassIdx === idx ? null : idx;
    if (currentLstBreaks) {
      const colors = YLORRD[currentClasses].slice(0, currentLstBreaks.length - 1);
      renderLstLegend(currentLstBreaks, colors, activeLstClassIdx);
    }
    applyLstFilter();
  });

  document.getElementById("residui-legend").addEventListener("click", (e) => {
    const sw = e.target.closest(".lst-legend-swatch");
    if (!sw) return;
    const idx = +sw.dataset.idx;
    activeResiduiClassIdx = activeResiduiClassIdx === idx ? null : idx;
    renderResiduiLegend(activeResiduiClassIdx);
    applyResiduiFilter();
  });

  document.querySelectorAll("#bivar-variant-btns .level-btn").forEach((b) => {
    b.addEventListener("click", () => {
      setBivariateVariant(b.dataset.variant);
      setBivariateEnabled(true);
    });
  });

  document.getElementById("biv-toggle").addEventListener("change", (e) => {
    setBivariateEnabled(e.target.checked);
  });

  buildLegend(() => applyBivFilter());
  updateBivariateLegendText();

  // --- Geo search bar: filtro geografico globale, interconnesso e persistente
  // su tutti i tab/overlay/livelli, cascabile con le classi di legenda ---
  const geoSearchUI = setupGeoSearch(geoSearch, {
    onSelect: (type, value) => {
      geoFilter = { level: type, value };
      geoSearchUI.renderChip(geoFilter);
      refreshAllFilters();
      const targetLevel = GEO_TYPE_LEVEL[type];
      const bbox = geoSearch.bboxes[targetLevel]?.[value];
      if (bbox) map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 60 });
    },
    onClear: () => {
      geoFilter = null;
      geoSearchUI.renderChip(geoFilter);
      refreshAllFilters();
    },
  });
}

main();
