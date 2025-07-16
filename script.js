let CSV_URL = window.CSV_URL;
if (!CSV_URL) {
  CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRPyrIYSN61zJY9_IUOwtNhRSF1l32Xo2UQjuDYGl3wIMwHjqPdXiIhvBsFhDu6wtyTnSN6qufe1kyA/pub?output=csv';
  window.CSV_URL = CSV_URL;
}

let allData = [];

const temperatureElement = document.getElementById('temp-value');
const humidityElement = document.getElementById('humidity-value');
const pressureElement = document.getElementById('pressure-value');
const lightElement = document.getElementById('light-value');
const uvIndexElement = document.getElementById('UVIndex-value');
const windspeedElement = document.getElementById('windspeed-value');
const windDirectionElement = document.getElementById('winddirection-value');
const rainElement = document.getElementById('rain-value');
const timestamp = document.getElementById('last-update');
const locationElement = document.getElementById("location");
const coords = document.getElementById("coords");


const detailsElements = document.querySelectorAll('.detail-container');
const footer = document.getElementById('site-footer');

// Nur wenn ein Footer existiert
if (footer) {
  footer.classList.add('fixed'); // Startzustand

  detailsElements.forEach(details => {
    details.addEventListener('toggle', () => {
      const anyOpen = Array.from(detailsElements).some(d => d.open);
      if (anyOpen) {
        footer.classList.remove('fixed');
        footer.classList.add('unfixed');
      } else {
        footer.classList.remove('unfixed');
        footer.classList.add('fixed');
      }
    });
  });
}



function get24HourLabels() {
  return Array.from({ length: 24 }, (_, h) =>
    h.toString().padStart(2, '0') + ':00'
  );
}

function convertUTCTextToCET(timestampStr) {
  const [datePart, timePart] = timestampStr.trim().split(' ');

  let day, month, year;
  if (datePart.includes('.')) {
    [day, month, year] = datePart.split('.');
  } else {
    [year, month, day] = datePart.split('-');
  }

  const [hour, minute, second] = timePart.split(':');

  const utcDate = new Date(Date.UTC(
    year, month - 1, day,
    hour, minute, second
  ));

  const formatter = new Intl.DateTimeFormat('de-CH', {
    timeZone: 'Europe/Zurich',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(utcDate);
  const get = (type) => parts.find(p => p.type === type).value;

  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function updateLiveStatus() {
  if (!allData || allData.length === 0) return;

  const latest = allData[allData.length - 1];

  // Letzter Zeitstempel als Date-Objekt (Achtung: Lokalzeit!)
  const [dateStr, timeStr] = latest.timestamp.split(' ');
  const [day, month, year] = dateStr.split('.');
  const [hour, minute, second] = timeStr.split(':');
  const latestDate = new Date(year, month - 1, day, hour, minute, second);

  const now = new Date();

  const diffMs = now - latestDate;
  const diffMin = diffMs / 60000; // ms → Minuten

  const statusElement = document.getElementById('live-indicator');

  if (diffMin < 10) {
    statusElement.textContent = 'Live';
    statusElement.style.backgroundColor = "#d1fae5";
    statusElement.style.color = "#065f46";
  } else {
    statusElement.textContent = 'Offline';
    statusElement.style.backgroundColor = "#fdd0d0ff";
    statusElement.style.color = "#7f1d1d";
  }
}

/**
 * Berechnet aus einem Array von Zahlen (mit möglichen null-Werten) 
 * das Minimum und Maximum mit einem 10 %-Puffer.
 *
 * @param {Array<number|null>} arr 
 * @returns {{min: number, max: number}}
 */
function computeScaleRange(arr) {
  // Nur gültige Zahlen behalten
  const vals = arr.filter(v => v != null && !isNaN(v));
  if (vals.length === 0) {
    return { min: 0, max: 1 };
  }
  const actualMin = Math.min(...vals);
  const actualMax = Math.max(...vals);
  const pad = (actualMax - actualMin) * 0.1;
  return {
    min: Math.floor(actualMin - pad),
    max: Math.ceil (actualMax + pad)
  };
}


function getHourlyMetric(allData, field, targetDateStr, config) {
  const { aggregate } = config;
  const buckets = Array.from({ length: 24 }, () => []);

  allData.forEach(e => {
    let [d, t] = e.timestamp.split(' ');
    if (d.includes('.')) {
      const [dd, mm, yy] = d.split('.');
      d = `${yy}-${mm}-${dd}`;
    }

    if (d !== targetDateStr) return;

    const hour = parseInt(t.split(':')[0], 10);
    let v = e[field];

    if (field === 'rain') {
      v = (v === 'Ja' || v === 'Yes') ? 1 : 0;
    } else if ([
      'temperature', 'humidity', 'light', 'UVIndex',
      'windspeed', 'pressure'
    ].includes(field)) {
      v = parseFloat(v);
    }

    // Nur gültige Zahlen hinzufügen
    if (!isNaN(v)) {
      buckets[hour].push(v);
    }
  });

  return buckets.map(arr => arr.length ? aggregate(arr) : null);
}

function getUniqueLocations(allData) {
  const set = new Set();
  allData.forEach(entry => {
    if (entry.location) {
      set.add(entry.location);
    }
  });
  return Array.from(set);
}

function populateLocationSelect() {
  const sel = document.getElementById('location-select');
  sel.innerHTML = '<option value="">— Standort wählen —</option>';
  getUniqueLocations(allData).forEach(loc => {
    const o = document.createElement('option');
    o.value = o.textContent = loc;
    sel.appendChild(o);
  });
}

function getUniqueMonths(data, location) {
  const months = new Set();
  data.forEach(e => {
    if (e.location !== location) return;
    let [d] = e.timestamp.split(' ');
    if (d.includes('.')) {
      const [dd,mm,yy] = d.split('.');
      d = `${yy}-${mm}-${dd}`;
    }
    months.add(d.slice(0,7));
  });
  return Array.from(months).sort();
}

function exportToExcel(dataArray, filename = 'messdaten.xlsx') {
  // Schritt 1: JSON zu Worksheet konvertieren
  const worksheet = XLSX.utils.json_to_sheet(dataArray);

  // Schritt 2: Worksheet zu einer neuen Arbeitsmappe hinzufügen
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Daten');

  // Schritt 3: Arbeitsmappe exportieren
  XLSX.writeFile(workbook, filename);
}


/**
 * Aggregiert alle Messwerte pro Tag und berechnet für jede Metrik das Mittel.
 * @param {Array} data - allData–Array mit timestamp‑Objekten.
 * @returns {Array} - Array mit Einträgen { date, temperature, humidity, pressure, light, UVIndex, windspeed, rain, windDirection, ort, altitude }
 */
function aggregateByDay(data) {
  const buckets = {}; // { 'YYYY-MM-DD': { sums..., count } }

  data.forEach(d => {
    // Datum-String im ISO‑Format extrahieren
    const isoDate = d.timestamp.split(' ')[0]
                      .split('.').reverse().join('-'); // DD.MM.YYYY → YYYY-MM-DD
    if (!buckets[isoDate]) {
      buckets[isoDate] = {
        sumTemp:0, sumHum:0, sumPres:0, sumLux:0,
        sumUV:0, sumWind:0, sumRain:0, count:0,
        // windDirection-Mittel als Vektor
        sumWx:0, sumWy:0
      };
    }
    const b = buckets[isoDate];
    b.sumTemp += d.temperature;
    b.sumHum  += d.humidity;
    b.sumPres += d.pressure;
    b.sumLux  += d.light;
    b.sumUV   += d.UVIndex;
    b.sumWind += d.windspeed;
    b.sumRain += (d.rain === 'Ja' ? 1 : 0);

    // Windrichtung als Vektor
    const rad = (parseFloat(d.windDirection) || 0) * Math.PI/180;
    b.sumWx  += Math.cos(rad);
    b.sumWy  += Math.sin(rad);

    b.count++;
  });

  // In Array umwandeln und Mittelwerte berechnen
  return Object.keys(buckets).sort().map(date => {
    const b = buckets[date];
    const avgDir = Math.atan2(b.sumWy/b.count, b.sumWx/b.count) * 180/Math.PI;
    return {
      date,
      temperature: b.sumTemp / b.count,
      humidity:    b.sumHum  / b.count,
      pressure:    b.sumPres / b.count,
      light:       b.sumLux  / b.count,
      UVIndex:     b.sumUV   / b.count,
      windspeed:   b.sumWind / b.count,
      rain:        b.sumRain / b.count >= 0.5 ? 'Ja' : 'Nein',
      windDirection: ((avgDir + 360) % 360).toFixed(0),
      // Ort und Höhe kannst du aus dem ersten Eintrag pro Tag ziehen,
      // oder weglassen, da sie tendenziell konstant sind.
    };
  });
}




function populateMonthSelect(location) {
  const sel = document.getElementById('month-select');
  sel.innerHTML = '';
  const names = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  getUniqueMonths(allData, location).forEach(m => {
    const [yy,mm] = m.split('-');
    const o = document.createElement('option');
    o.value = m;
    o.textContent = `${names[parseInt(mm)-1]} ${yy}`;
    sel.appendChild(o);
  });
}

function populateDateSelect(location, month) {
  const sel = document.getElementById('date-select');
  sel.innerHTML = '';  // alle alten Optionen löschen

  const days = new Set();
  allData.forEach(e => {
    if (e.location !== location) return;
    let [d] = e.timestamp.split(' ');
    if (d.includes('.')) {
      const [dd,mm,yy] = d.split('.');
      d = `${yy}-${mm}-${dd}`;
    }
    if (d.startsWith(month)) days.add(d);
  });

  Array.from(days).sort().forEach(d => {
    const [yy,mm,dd] = d.split('-');
    const opt = document.createElement('option');
    opt.value       = d;                // ISO‑Wert "YYYY-MM-DD"
    opt.textContent = `${dd}.${mm}.${yy}`; // Anzeige "DD.MM.YYYY"
    sel.appendChild(opt);
  });
}

function getDailyMetric(data, field, dateISO) {
  const map = new Map();
  data.forEach(e => {
    let [d,t] = e.timestamp.split(' ');
    if (d.includes('.')) {
      const [dd,mm,yy] = d.split('.');
      d = `${yy}-${mm}-${dd}`;
    }
    if (d !== dateISO) return;
    let v = e[field];
    if (field==='rain')    v = (v==='Ja'||v==='Yes')?1:0;
    if (field==='pressure'){
      v = parseFloat(v);

    } 
    const hr = parseInt(t.split(':')[0],10);
    map.set(hr, parseFloat(v));
  });
  return get24HourLabels().map((_,i)=> map.get(i) ?? null);
}

let historyChart;

function initEmptyHistoryChart() {
  const ctx = document.getElementById('historyChart').getContext('2d');
  // Zerstöre gegebenenfalls den alten Chart
  if (historyChart) historyChart.destroy();

  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: get24HourLabels(),   // 00:00, 01:00, …
      datasets: []                 // leer
    },
    options: {
      scales: {
        x: { title: { display: true, text: 'Stunde' } },
        y: { title: { display: true, text: '' } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });
}





function drawHistoryFor(location, dateISO, metricName) {
  const cfg = metricConfig[metricName];
  if (!cfg) {
    console.error(`Unbekannte Metrik: ${metricName}`);
    return;
  }

  // 1) Filtern nach Datum+Ort
  const filtered = allData.filter(e => {
    let [d] = e.timestamp.split(' ');
    if (d.includes('.')) {
      const [dd,mm,yy] = d.split('.');
      d = `${yy}-${mm}-${dd}`;
    }
    return d === dateISO && e.location === location;
  });

  if (filtered.length === 0) {
    // ggf. Chart löschen oder Meldung
    return;
  }

  // 2) Stundenweise Daten vorbereiten
  const data = getHourlyMetric(allData, cfg.field, dateISO, cfg);
  const labels = get24HourLabels();

  // 3) Dynamische Min/Max berechnen
  const { min: dynMin, max: dynMax } = computeScaleRange(data);

  // 4) Standard‑Bereich aus config
  let finalMin = cfg.min;
  let finalMax = cfg.max;

  // 5) Schwellen‑Logik analog zum Daily‑Chart
  if (metricName === 'Temperatur') {
    if (dynMin < 10) { finalMin = -5; finalMax = 25; }
    else if (dynMax > 35) { finalMin = 15; finalMax = 40; }
  }
  if (metricName === 'Helligkeit') {
    finalMin = 0;
    if (dynMax > 50000) finalMax = 75000;
    else if (dynMax > 10000) finalMax = 50000;
  }
  if (metricName === 'Windgeschwindigkeit') {
    finalMin = 0;
    if (dynMax > 40) finalMax = 80;
    else if (dynMax > 20) finalMax = 50;
  }

  // 6) Chart zeichnen / updaten
  const ctx = document.getElementById('historyChart').getContext('2d');
  console.log(ctx);
  if (historyChart) historyChart.destroy();
  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: cfg.label + ' am ' + dateISO,
        data,
        spanGaps: true,
        tension: 0.3,
        borderColor: chartColors[metricName],
        backgroundColor: 'rgba(59,130,246,0.2)',
        pointRadius: 3
      }]
    },
    options: {
      scales: {
        x: { title: { display: true, text: 'Stunde' } },
        y: {
          min: finalMin,
          max: finalMax,
          title: { display: true, text: cfg.label },
          ticks: { stepSize: cfg.stepSize }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });
  renderHistoryDetailData(dateISO, location);
}



//fetch live Daten
async function fetchData(){
  try{
    const res = await fetch(CSV_URL);
    const text = await res.text();
    const lines = text.trim().split('\n');
    lines.shift(); // Entfernt die Kopfzeile

    allData = lines.map(line => {
      let [timestamp, temperature, humidity, pressure, light, UVIndex, windspeed, windDirection, location, altitude, rain] = line.split(',');

      if(windDirection === "Sden"){
        windDirection = "Süden";
      }else if(windDirection === "Sdwest"){
        windDirection = "Südwest";
      }
      if(rain === "No"){
        rain = "Nein";
      }
      else if(rain === "Yes"){
        rain = "Ja";
      }

      return {
        timestamp:  convertUTCTextToCET(timestamp),
        temperature: parseFloat(temperature),
        humidity: parseFloat(humidity),
        pressure: parseFloat(pressure/100),
        light: parseFloat(light),
        UVIndex: parseFloat(UVIndex),
        windspeed: parseFloat(windspeed),
        windDirection,
        location,
        altitude: parseFloat(altitude),
        rain
      };
    });
    console.log('Fetched data:', allData
    );
  } catch (error) { 
    console.error('Error fetching data:', error);
    };

    updateLiveStatus();
}




function renderLive(){
  if(!allData || allData.length === 0) {
    console.error('No data available to render live section.');
    return;
  }

  const latest = allData[allData.length - 1];

  if(latest.rain === "Yes"){
    latest.rain = "Ja";
  }
  else if(latest.rain === "No"){
    latest.rain = "Nein";
  }



  temperatureElement.textContent = latest.temperature.toFixed(2);
  humidityElement.textContent = latest.humidity.toFixed(2);
  pressureElement.textContent = latest.pressure.toFixed(2);
  lightElement.textContent = latest.light.toFixed(2);
  uvIndexElement.textContent = latest.UVIndex.toFixed(1);
  windspeedElement.textContent = latest.windspeed.toFixed(2);
  windDirectionElement.textContent = latest.windDirection;
  rainElement.textContent = latest.rain;
  locationElement.textContent = "Ort: " + latest.location;
  coords.dataset.tooltip = "Lat: " + "---," + "Lon: " + "---, " + "Höhe: " + latest.altitude + " m";
  timestamp.textContent = latest.timestamp;
}


function startAutoRefresh() {
  // Erstmalig laden und rendern
  fetchData().then();
  const todaysData = getTodaysData(allData);
  //renderDetailData(todaysData, 'detail-data');

  setInterval(async () => {
  await fetchData();
  renderLive();
  renderMetricChart(document.getElementById('metric-select').value, 0);
  updateLiveStatus();
  const todaysData = getTodaysData(allData);
  renderDetailData(todaysData, 'detail-data');
}, 2 * 60 * 1000);}



const metricConfig = {
  Temperatur: {
    field: 'temperature',
    label: 'Temperatur (°C)',
    min: 10, max: 35, stepSize: 5,
    aggregate: arr => arr.reduce((a,b)=>a+b,0) / arr.length
  },
  Luftfeuchtigkeit: {
    field: 'humidity',
    label: 'Luftfeuchtigkeit (%)',
    min: 0, max: 100, stepSize: 20,
    aggregate: arr => arr.reduce((a,b)=>a+b,0) / arr.length
  },
  Luftdruck: {
    field: 'pressure',
    label: 'Luftdruck (hPa)',
    min: 980, max: 1040, stepSize: 10,
    aggregate: arr => (arr.reduce((a,b)=>a+b,0) / arr.length)
  },
  Helligkeit: {
    field: 'light',
    label: 'Helligkeit (lux)',
    min: 0, max: 20000, stepSize: 2000,
    aggregate: arr => arr.reduce((a,b)=>a+b,0) / arr.length
  },
  'UV-Index': {
    field: 'UVIndex',
    label: 'UV-Index',
    min: 0, max: 12, stepSize: 2,
    aggregate: arr => arr.reduce((a,b)=>a+b,0) / arr.length
  },
  Windgeschwindigkeit: {
    field: 'windspeed',
    label: 'Windgeschwindigkeit (km/h)',
    min: 0, max: 50, stepSize: 10,
    aggregate: arr => Math.max(...arr)  // maximale Böe
  },
  Regen: {
    field: 'rain',
    label: 'Regen (Ja=1/Nein=0)',
    min: 0, max: 1, stepSize: 1,
    aggregate: arr => arr.some(v => v===1) ? 1 : 0
  },
  Windrichtung: {
    field: 'windDirection',
    label: 'Windrichtung',
    min: 0, max: 360, stepSize: 45,
    // Vektor‑Mittel: wandle Winkel→Vektoren, mitteln, zurück
    aggregate: arr => {
      const toRad = a => a * Math.PI/180;
      const toDeg = r => r * 180/Math.PI;
      let x=0, y=0;
      arr.forEach(dir => {
        const d = parseFloat(dir) * Math.PI/180;
        x += Math.cos(d);
        y += Math.sin(d);
      });
      const avg = Math.atan2(y, x);
      return (toDeg(avg) + 360) % 360; 
    }
  }
};

const chartColors = {
  Temperatur: 'rgba(234, 88, 12, 1)',
  Luftfeuchtigkeit: 'rgba(37, 99, 235, 1)',
  Luftdruck: 'rgba(124, 58, 237, 1)',
  Helligkeit: 'rgba(202, 138, 4, 1)',
  'UV-Index': 'rgba(220, 38, 38, 1)',
  Windgeschwindigkeit: 'rgba(22, 163, 74, 1)',
  Regen: 'rgba(3, 105, 161, 1)'
};




let dailyChart;

function renderMetricChart(metricName, offsetDays = 0) {
  const cfg = metricConfig[metricName];
  if (!cfg || typeof cfg.aggregate !== 'function') {
    console.error(`Ungültige Metrik-Konfiguration für: ${metricName}`);
    return;
  }

  // Datum ermitteln
  const today = new Date();
  today.setDate(today.getDate() + offsetDays);
  const targetDateStr = today.toISOString().slice(0,10);

  // Stundenweise Daten holen
  const data   = getHourlyMetric(allData, cfg.field, targetDateStr, cfg);
  const labels = get24HourLabels();

  // Dynamische Min/Max aus den Daten
  const { min: dynMin, max: dynMax } = computeScaleRange(data);

  // Default‑Bereiche aus config
  let finalMin = cfg.min;
  let finalMax = cfg.max;

  // Spezielle Logik für Temperatur
  if (metricName === 'Temperatur') {
    if (dynMin < 10) {
      finalMin = -5; finalMax = 25;
    } else if (dynMax > 35) {
      finalMin = 15; finalMax = 40;
    }
  }

  // Für Helligkeit
  if (metricName === 'Helligkeit') {
    if (dynMax > 10000 && dynMax <= 50000) {
      finalMax = 50000;
    } else if (dynMax > 50000) {
      finalMax = 75000;
    }
    // min bleibt bei 0
    finalMin = 0;
  }

  // Für Windgeschwindigkeit
  if (metricName === 'Windgeschwindigkeit') {
    if (dynMax > 20 && dynMax <= 40) {
      finalMax = 50;
    } else if (dynMax > 40) {
      finalMax = 80;
    }
    // min bleibt bei 0
    finalMin = 0;
  }


  // Chart rendern
  const ctx = document.getElementById('dailyChart').getContext('2d');
  if (dailyChart) dailyChart.destroy();
  dailyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: cfg.label,
        data,
        spanGaps: true,
        tension: 0.3,
        borderColor: chartColors[metricName],
        backgroundColor: 'rgba(59,130,246,0.2)',
        pointRadius: 3
      }]
    },
    options: {
      scales: {
        x: { title: { display: true, text: 'Stunde' } },
        y: {
          min: finalMin,
          max: finalMax,
          title: { display: true, text: cfg.label },
          ticks: { stepSize: cfg.stepSize }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });
}


async function start() {
  await fetchData().then(() => {
  populateLocationSelect();
});
  renderLive();
  const todaysData = getTodaysData(allData);
  renderDetailData(todaysData, 'detail-data');
  // statt renderDailyChart jetzt das Chart für die ausgewählte Metrik zeichnen:
  const select = document.getElementById('metric-select');
  renderMetricChart(select.value, 0);
  updateLiveStatus();
}

start();


/**
 * Fügt alle Einzelmessungen für den gewählten Standort und Tag in die History‑Tabelle ein.
 * Und öffnet das Details‑Panel, falls Daten vorhanden sind.
 *
 * @param {string} location   Der Standort-Name
 * @param {string} dateISO    Das Datum im Format "YYYY-MM-DD"
 */


function renderDetailData(data) {
  const container = document.getElementById('detail-data');
  const footer    = document.getElementById('detail-footer');
  container.innerHTML = '';
  footer.innerHTML    = '';

  const spanElement = document.getElementById("detail-summary-text");
  let ort = data[0].location;
  let date = data[0].timestamp.split(" ")[0];

  let spanText = `Rohdaten vom ${date} - ${ort}`;

  spanElement.innerHTML = spanText;

  // 1) Gruppiere nach Stunde
  const groups = data.reduce((acc, entry) => {
    const time = entry.timestamp.split(' ')[1]; // "HH:MM:SS"
    const hour = time.slice(0,2);               // "HH"
    if (!acc[hour]) acc[hour] = [];
    acc[hour].push({ ...entry, time });
    return acc;
  }, {});

  // 2) Erzeuge für jede Stunde ein <details>
  Object.keys(groups).sort().forEach(hour => {
    const entries = groups[hour];

    const details = document.createElement('details');
    details.className = 'hour-group';

    const summary = document.createElement('summary');
    summary.textContent = `${hour}:00 – ${hour}:59`;;
    details.appendChild(summary);

    const table = document.createElement('table');
    table.className = 'hour-table';

    // Kopfzeile
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Zeit</th><th>Temp (°C)</th><th>Feuchte (%)</th>
        <th>Druck</th><th>Helligk. (lx)</th><th>UV</th>
        <th>Wind (km/h)</th><th>Richtung</th><th>Regen</th>
      </tr>`;
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    entries.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${e.time}</td>
        <td>${e.temperature.toFixed(1)}</td>
        <td>${e.humidity.toFixed(1)}</td>
        <td>${e.pressure.toFixed(1)}</td>
        <td>${e.light.toFixed(0)}</td>
        <td>${e.UVIndex.toFixed(1)}</td>
        <td>${e.windspeed.toFixed(1)}</td>
        <td>${e.windDirection}</td>
        <td>${e.rain}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    details.appendChild(table);
    container.appendChild(details);
  });
  

  // 3) Download‑Button einfügen
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'download-btn';
  downloadBtn.textContent = 'Herunterladen';
  downloadBtn.addEventListener('click', () => exportToExcel(data));
  footer.appendChild(downloadBtn);
}


function getTodaysData(data) {
  const today = new Date();
  const day   = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year  = today.getFullYear();

  const todayStr = `${day}.${month}.${year}`; // DD.MM.YYYY

  return data.filter(entry => entry.timestamp.startsWith(todayStr));
}


function renderHistoryDetailData(dateISO, location) {
  const container = document.getElementById('history-detail-data');
  const detailsBox = document.getElementById('history-details');
  container.innerHTML = '';    // alten Inhalt löschen

  const spanElement = document.getElementById("spanElement");
  let ort = location;
  let year = dateISO.split("-")[0];
  let month = dateISO.split("-")[1];
  let day = dateISO.split("-")[2];

  let spanText = `Rohdaten vom ${day}.${month}.${year} - ${ort}`;

  spanElement.innerHTML = spanText;

  // Filtere nur Einträge für das Datum + Ort
  const filtered = allData.filter(e => {
    let [d] = e.timestamp.split(' ');
    if (d.includes('.')) {
      const [dd, mm, yy] = d.split('.');
      d = `${yy}-${mm}-${dd}`;
    }
    return d === dateISO && e.location === location;
  });

  if (!filtered.length) {
    detailsBox.classList.add('hidden');
    container.innerHTML = '<p style="padding:1rem;">Keine Daten für diesen Tag.</p>';
    return;
  }

  detailsBox.classList.remove('hidden');

  // 1) Gruppiere nach Stunde
  const groups = filtered.reduce((acc, e) => {
    const time = e.timestamp.split(' ')[1];    // "HH:MM:SS"
    const hour = time.slice(0,2);               // "HH"
    if (!acc[hour]) acc[hour] = [];
    acc[hour].push({ ...e, time });
    return acc;
  }, {});

  // 2) Erzeuge Accordion pro Stunde
  Object.keys(groups).sort().forEach(hour => {
    const entries = groups[hour];

    const details = document.createElement('details');
    details.className = 'hour-group';

    const summary = document.createElement('summary');
    summary.textContent = `${hour}:00 – ${hour}:59`;
    details.appendChild(summary);

    const table = document.createElement('table');
    table.className = 'hour-table';

    // Kopfzeile
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Zeit</th><th>Temp</th><th>Feuchte</th>
        <th>Druck</th><th>Helligk.</th><th>UV</th>
        <th>Wind</th><th>Richtung</th><th>Regen</th>
      </tr>`;
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    entries.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${e.time}</td>
        <td>${e.temperature.toFixed(1)}</td>
        <td>${e.humidity.toFixed(1)}</td>
        <td>${e.pressure.toFixed(1)}</td>
        <td>${e.light.toFixed(0)}</td>
        <td>${e.UVIndex.toFixed(1)}</td>
        <td>${e.windspeed.toFixed(1)}</td>
        <td>${e.windDirection}</td>
        <td>${e.rain}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    details.appendChild(table);
    container.appendChild(details);
  });

  // 3) Download‑Button in history-footer einfügen
  const historyFooter = document.getElementById('history-detail-footer');
  historyFooter.innerHTML = '';
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'download-btn';
  downloadBtn.textContent = 'Herunterladen';

  let filename = `messdaten ${day}.${month}.${year}.xlsx`;

  downloadBtn.addEventListener('click', () => {
    exportToExcel(filtered, filename); // <- `data` ist das Array mit Messwerten
  });

  historyFooter.appendChild(downloadBtn);
}






document.addEventListener('DOMContentLoaded', () => {
  const liveTab = document.getElementById('live-tab');
  const historyTab = document.getElementById('history-tab');
  const liveSection = document.getElementById('live-section');
  const historySection = document.getElementById('history-section');

  liveTab.addEventListener('click', () => {
    liveTab.classList.add('active');
    historyTab.classList.remove('active');
    liveSection.classList.remove('hidden');
    historySection.classList.add('hidden');
  });

  historyTab.addEventListener('click', () => {
    historyTab.classList.add('active');
    liveTab.classList.remove('active');
    historySection.classList.remove('hidden');
    liveSection.classList.add('hidden');
  });

  if (window.GPS_DATA) {
    document.getElementById('location').textContent = `Ort: ${window.GPS_DATA.location}`;
    document.getElementById('altitude').textContent = `Höhe: ${window.GPS_DATA.altitude} m`;
    const coordsSpan = document.getElementById('coords');
    coordsSpan.title = `Lat: ${window.GPS_DATA.latitude}, Lon: ${window.GPS_DATA.longitude}, Höhe: ${window.GPS_DATA.altitude} m`;
    coordsSpan.classList.add('tooltip');
  }

   const select = document.getElementById('metric-select');

  // Beim Ändern: neues Chart zeichnen
  select.addEventListener('change', () => {
    renderMetricChart(select.value, 0);
  });

  const panel = document.getElementById('detail-panel');

  startAutoRefresh()
  renderMetricChart(select.value, 0);

  // TODO: Fetch und Render Historische Daten
  // TODO: Aufbau des Charts mit Chart.js oder ähnlichem
});

document.addEventListener('DOMContentLoaded', async ()=> {
  await fetchData();
  populateLocationSelect();
  initEmptyHistoryChart();

  const locSel   = document.getElementById('location-select');
  const monSel   = document.getElementById('month-select');
  const dateSel  = document.getElementById('date-select');
  const metricSel= document.getElementById('history-metric-select');

  locSel.addEventListener('change', ()=>{
    const loc = locSel.value;
    populateMonthSelect(loc);
    monSel.selectedIndex = 0;
    populateDateSelect(loc, monSel.value);
    drawHistoryFor(loc, dateSel.value, metricSel.value);
  });

  monSel.addEventListener('change', ()=>{
    populateDateSelect(locSel.value, monSel.value);
    drawHistoryFor(locSel.value, dateSel.value, metricSel.value);
  });

  dateSel.addEventListener('change', ()=>{
    drawHistoryFor(locSel.value, dateSel.value, metricSel.value);
  });

  metricSel.addEventListener('change', ()=>{
    drawHistoryFor(locSel.value, dateSel.value, metricSel.value);
  });

  // erste Ausführung
  locSel.selectedIndex = 0;
  locSel.dispatchEvent(new Event('change'));
});