# Isole di calore urbane · Palermo

Web app interattiva che mostra **dove fa più caldo a Palermo in estate**, sezione censuaria per sezione censuaria, usando immagini satellitari e analisi geospaziale.

🔗 Vedi anche la scheda "Guida e Credits" dentro l'app stessa: contiene le stesse spiegazioni, sempre disponibili.

## Cos'è

L'app incrocia dati di **temperatura superficiale terrestre** (LST, Land Surface Temperature) rilevati da satellite con la morfologia del territorio (quota, pendenza, esposizione al sole, densità stradale), per capire quanto delle "isole di calore" di Palermo sia dovuto al clima/territorio e quanto invece alla città costruita (asfalto, cemento, mancanza di verde).

La app ha 4 schede:

1. **Isole di calore** — temperatura superficiale (LST) anno per anno, dal 2019 al 2025, con timeline animabile.
2. **Bivariata** — incrocia due variabili insieme (es. LST 2025 × trend 2019-2025, oppure LST × densità viaria) in un'unica mappa a doppia scala colore.
3. **Isola vera** — la temperatura "depurata" dalla morfologia naturale del territorio: mostra solo il calore in più (o in meno) che la città costruita aggiunge rispetto a quanto ci si aspetterebbe dal territorio.
4. **Guida e Credits** — spiegazioni, fonti, licenza.

Livelli territoriali disponibili ovunque: **sezioni censuarie**, **quartieri**, **circoscrizioni**, **UPL** (Unità di Primo Livello).

## Fonte dati

- **Temperatura superficiale (LST)**: [Landsat Science Products](https://www.usgs.gov/landsat-missions/landsat-science-products) (USGS), immagini satellitari Landsat 8/9, banda termica, estate di ogni anno 2019-2025.
- **Confini amministrativi**: sezioni censuarie ISTAT 2021, quartieri, circoscrizioni e UPL di Palermo.
- **Modello del terreno (DTM)**: dati altimetrici a risoluzione 5 metri, usati per calcolare quota, pendenza, esposizione (aspect) e Sky View Factor (SVF, cioè quanto cielo è "visibile" da un punto — un canyon urbano stretto ha SVF basso).
- **Rete viaria**: dati stradali, usati per calcolare densità stradale (km di strada per kmq) e superficie impermeabile stradale.

## Come sono state calcolate le mappe

### 1. LST anno per anno (scheda "Isole di calore")

Per ogni sezione censuaria si calcola la temperatura superficiale media da immagini satellitari Landsat, per ciascun anno 2019-2025. I valori vengono poi aggregati (media, min, max, mediana) a quartiere, circoscrizione e UPL.
Script: `scripts/build_lst_years.py`.

Puoi cambiare il **metodo di classificazione dei colori** (Jenks, Quantili, Intervalli uguali) e il **numero di classi** (3-9): cambia solo come i valori vengono raggruppati in fasce di colore, non i dati.

### 2. Mappa bivariata

Incrocia due indicatori insieme in una griglia di colori a doppia entrata (es. righe = LST 2025, colonne = variazione 2019→2025, oppure densità viaria). Ogni sezione viene classificata su entrambe le variabili contemporaneamente, e il colore combina le due classificazioni (schema Rosso-Giallo).

### 3. Isola di calore "vera" (residui di regressione)

Qui si isola la parte di calore che **non** è spiegata dal territorio naturale.

Passaggi:

1. Per ogni sezione si calcolano, dal DTM, le variabili morfologiche: quota media, pendenza media, SVF medio, esposizione (aspetto, trasformato in seno/coseno perché è una variabile circolare). Script: `scripts/dtm_zonal_stats_sezioni.py`.
2. Per ogni sezione si calcola dalla rete stradale la densità viaria (km/kmq) e la superficie impermeabile stradale. Script: `scripts/viabilita_zonal_stats_sezioni.py`.
3. Si stima una **regressione lineare multipla (OLS)**:

   `LST_2025 ~ quota + pendenza + SVF + aspetto(seno, coseno) + densità_viaria + densità_viaria×SVF`

   L'interazione densità viaria × SVF serve a catturare l'effetto "canyon urbano": una strada trafficata scalda molto solo se il cielo sopra è poco visibile (SVF basso).
   La superficie impermeabile stradale è stata esclusa dal modello finale perché troppo collineare con la densità viaria (correlazione 0.95, stesso segnale misurato in due modi diversi).
   Modello finale: R² ≈ 0.22 (spiega circa il 22% della variabilità di temperatura tra sezioni).
   Script: `scripts/regressione_lst_dtm_viabilita.py`.

4. Il **residuo** di ogni sezione (temperatura osservata − temperatura prevista dal modello) è la "isola di calore vera": positivo = più caldo di quanto il territorio giustificherebbe (colpa della città costruita), negativo = più fresco del previsto.
   Script: `scripts/build_residui_pmtiles.py`, che produce anche i dati per lo scatter plot osservato-vs-previsto mostrato nella scheda.

## Strumenti usati

- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) — motore della mappa interattiva
- [PMTiles](https://github.com/protomaps/PMTiles) + [Tippecanoe](https://github.com/felt/tippecanoe) — creazione ed erogazione dei tile vettoriali (niente server dati dedicato, i file `.pmtiles` sono statici)
- [QGIS](https://qgis.org/) — analisi geospaziale e statistiche zonali (DTM, viabilità)
- Python (GDAL/rasterio/pandas/numpy/scipy) — elaborazione dati LST, calcolo derivate DTM, regressione OLS
- [Simple Statistics](https://simplestatistics.org/) — classificazione Jenks/quantili lato browser

## Ispirazioni

- [Rapporto Greenpeace - Caldo estremo](https://www.greenpeace.org/italy/comunicato-stampa/31174/) — le giornate di forte stress da calore in Italia sono passate dal 39% al 62%
- [Mappa interattiva della temperatura superficiale estiva](https://cimbelli.github.io/lst-viewer/) di Alessandro Cimbelli

## Licenza

Contenuti rilasciati con licenza [CC BY 4.0 – Attribuzione 4.0 Internazionale](https://creativecommons.org/licenses/by/4.0/deed.it). Libero uso e adattamento, anche commerciale, citando la fonte.

## Sviluppo

Web app progettata e sviluppata da [@gbvitrano](https://www.linkedin.com/in/gbvitrano/) in collaborazione con Claude AI (Anthropic), per [OpenDataSicilia.it](https://opendatasicilia.it).
