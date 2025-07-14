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


function getHourlyMetric(allData, field, offsetDays = 0) {
  const labels = get24HourLabels();
  const hourMap = new Map();

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - offsetDays);
  const targetDateStr = targetDate.toISOString().slice(0,10); // "YYYY-MM-DD"

  allData.forEach(entry => {
    let [datePart, timePart] = entry.timestamp.split(' ');
    if (datePart.includes('.')) {
      const [d, m, y] = datePart.split('.');
      datePart = `${y}-${m}-${d}`;
    }

    if (datePart !== targetDateStr) return;

    const hour = parseInt(timePart.split(':')[0], 10);
    let value = entry[field];

    // Sonderbehandlung für "rain" und "pressure"
    if (field === 'rain') {
      value = (value === 'Ja' || value === 'Yes') ? 1 : 0;
    }
    if (field === 'pressure') {
      value = parseFloat(value); // hPa statt Pa
    }

    hourMap.set(hour, parseFloat(value));
  });

  return labels.map((_, h) => hourMap.get(h) ?? null);
}



//fetch live Daten
async function fetchData(){
  try{
    const res = await fetch(CSV_URL);
    const text = await res.text();
    const lines = text.trim().split('\n');
    lines.shift(); // Entfernt die Kopfzeile

    allData = lines.map(line => {
      const [timestamp, temperature, humidity, pressure, light, UVIndex, windspeed, windDirection, location, altitude, rain] = line.split(',');
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

  if(latest.rain === "Ja" || latest.rain === "Yes"){
    latest.rain = "Ja";
  }
  else if(latest.rain === "Nein" || latest.rain === "No"){
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
  fetchData().then(renderLive);

  setInterval(async () => {
  await fetchData();
  renderLive();
  renderDailyChart();
  updateLiveStatus();
}, 5 * 60 * 1000);}



const metricConfig = {
  Temperatur: {
    field: 'temperature',
    label: 'Temperatur (°C)',
    min: 10, max: 35, stepSize: 5
  },
  Luftfeuchtigkeit: {
    field: 'humidity',
    label: 'Luftfeuchtigkeit (%)',
    min: 0,  max: 100, stepSize: 20
  },
  Luftdruck: {
    field: 'pressure',
    label: 'Luftdruck (hPa)',
    min: 980, max: 1040, stepSize: 10
  },
  Helligkeit: {
    field: 'light',
    label: 'Helligkeit (lux)',
    min: 0, max: 10000, stepSize: 2000
  },
  'UV-Index': {
    field: 'UVIndex',
    label: 'UV-Index',
    min: 0, max: 12, stepSize: 2
  },
  Windgeschwindigkeit: {
    field: 'windspeed',
    label: 'Windgeschwindigkeit (km/h)',
    min: 0, max: 50, stepSize: 10
  },
  Regen: {
    field: 'rain',
    label: 'Regen (Ja=1/Nein=0)',
    min: 0, max: 1, stepSize: 1
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
  const config = metricConfig[metricName];
  const data = getHourlyMetric(allData, config.field, offsetDays);
  const labels = get24HourLabels();

  const ctx = document.getElementById('dailyChart').getContext('2d');
  if (dailyChart) dailyChart.destroy();

  dailyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: config.label,
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
        x: {
          title: { display: true, text: 'Stunde' }
        },
        y: {
          title: { display: true, text: config.label },
          min: config.min,
          max: config.max,
          ticks: { stepSize: config.stepSize }
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
  await fetchData();
  renderLive();
  // statt renderDailyChart jetzt das Chart für die ausgewählte Metrik zeichnen:
  const select = document.getElementById('metric-select');
  renderMetricChart(select.value, 0);
  updateLiveStatus();
}

start();



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

  startAutoRefresh()
  renderMetricChart(select.value, 0);

  // TODO: Fetch und Render Historische Daten
  // TODO: Aufbau des Charts mit Chart.js oder ähnlichem
});