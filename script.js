const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRPyrIYSN61zJY9_IUOwtNhRSF1l32Xo2UQjuDYGl3wIMwHjqPdXiIhvBsFhDu6wtyTnSN6qufe1kyA/pub?output=csv';

async function loadAndDraw() {
  const res  = await fetch(CSV_URL);
  const text = await res.text();
  const rows = text.trim().split('\n').slice(1); // Kopfzeile entfernen

  const labels = [], temps = [];
  rows.forEach(line => {
    const [ts, temp] = line.split(',');
    labels.push(ts.slice(11));        // nur Uhrzeit HH:MM:SS
    temps.push(parseFloat(temp));     // Temperatur
  });

  new Chart(document.getElementById('tempChart'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Temperatur (°C)',
        data: temps,
        tension: 0.4
      }]
    },
    options: {
      scales: {
        x: { display: true },
        y: { beginAtZero: false }
      }
    }
  });
}

// Erstmal zeichnen, dann alle 5 Minuten aktualisieren
loadAndDraw();
setInterval(loadAndDraw, 5 * 60 * 1000);
