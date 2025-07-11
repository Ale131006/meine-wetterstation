let CSV_URL = window.CSV_URL;
if (!CSV_URL) {
  CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRPyrIYSN61zJY9_IUOwtNhRSF1l32Xo2UQjuDYGl3wIMwHjqPdXiIhvBsFhDu6wtyTnSN6qufe1kyA/pub?output=csv';
  window.CSV_URL = CSV_URL;
}

//fetch live Daten

// Lädt CSV-Daten und gibt sie als Array zurück
async function loadData() {
  const res = await fetch(CSV_URL);
  const text = await res.text();
  const lines = text.trim().split('\n');
  lines.shift();
  const data = lines.map(line => {
    const [timestamp, temperature, humidity, pressure, light] = line.split(',');
    return { timestamp, temperature: parseFloat(temperature), humidity: parseFloat(humidity), pressure: parseFloat(pressure), light: parseFloat(light) };
  });
  console.log('Loaded data:', data);
  return data;
}

loadData();


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

  // TODO: Fetch und Render Live-Daten
  // TODO: Fetch und Render Historische Daten
  // TODO: Aufbau des Charts mit Chart.js oder ähnlichem
});

