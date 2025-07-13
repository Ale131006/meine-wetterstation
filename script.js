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
        timestamp: new Date(timestamp),
        temperature: parseFloat(temperature),
        humidity: parseFloat(humidity),
        pressure: parseFloat(pressure),
        light: parseFloat(light),
        UVIndex: parseFloat(UVIndex),
        windspeed: parseFloat(windspeed),
        windDirection,
        location,
        altitude: parseFloat(altitude),
        rain
      };
    });
    console.log('Fetched data:', allData);
  } catch (error) { 
    console.error('Error fetching data:', error);
    };
}




function renderLive(){
  if(!allData || allData.length === 0) {
    console.error('No data available to render live section.');
    return;
  }

  const latest = allData[allData.length - 1];

  temperatureElement.textContent = latest.temperature.toFixed(2);
  humidityElement.textContent = latest.humidity.toFixed(2);
  pressureElement.textContent = latest.pressure.toFixed(2);
  lightElement.textContent = latest.light.toFixed(2);
  uvIndexElement.textContent = latest.UVIndex.toFixed(1);
  windspeedElement.textContent = latest.windspeed.toFixed(2);
  windDirectionElement.textContent = latest.windDirection;
  rainElement.textContent = latest.rain ? "Ja" : "Nein";


}


function startAutoRefresh() {
  // Erstmalig laden und rendern
  fetchData().then(renderLive);

  // Alle 5 Minuten: Daten erneuern und, falls Live-Tab aktiv, neu rendern
  setInterval(async () => {
    await fetchData();
    if (document.getElementById('live-tab').classList.contains('active')) {
      renderLive();
    }
  }, 5 * 60 * 1000);
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

  startAutoRefresh();

  // TODO: Fetch und Render Live-Daten
  // TODO: Fetch und Render Historische Daten
  // TODO: Aufbau des Charts mit Chart.js oder ähnlichem
});

