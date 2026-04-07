import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
import math
import os
import json
import pytz
from datetime import datetime, timedelta
import matplotlib.pyplot as plt

# Importiere deine LSTM-Funktionen
from LSTM_weather_forecast_final import get_pred, load_and_clean_data

# --- KONFIGURATION ---
URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRPyrIYSN61zJY9_IUOwtNhRSF1l32Xo2UQjuDYGl3wIMwHjqPdXiIhvBsFhDu6wtyTnSN6qufe1kyA/pub?output=csv"
DROP_COLS = ["Timestamp", 'Altitude', 'maxWindSpeed', 'windspeed', 'Latitude', 'Longitude','Ort','winddirection', 'Monat', 'Tag','Stunde']
TARGETS = ["Temp", "Hum", "pres", "light", "Uv"]
N_ENSEMBLE = 5  # Höhere Zahl gibt schönere Flächen

# --- RF LOGIK (bleibt gleich) ---
def prepare_rf_data(url):
    df = pd.read_csv(url).dropna()
    df.to_csv("Data/weather_data.csv", index=False)
    df['Timestamp'] = pd.to_datetime(df['Timestamp'], format='%d.%m.%Y %H:%M:%S')
    df = df.set_index('Timestamp')
    df_res = df.resample('15min').mean(numeric_only=True)
    df_text = df[['rain', 'Ort', 'winddirection']].resample('15min').first()
    df = df_res.join(df_text).reset_index().dropna()
    df['Jahr'] = df['Timestamp'].dt.year
    df["monat_sin"] = np.sin(2*math.pi * df["Timestamp"].dt.month/12)
    df["monat_cos"] = np.cos(2*math.pi * df["Timestamp"].dt.month/12)
    df["hour_sin"] = np.sin(2*math.pi * df["Timestamp"].dt.hour/24)
    df["hour_cos"] = np.cos(2*math.pi * df["Timestamp"].dt.hour/24)
    le = LabelEncoder()
    df["rain"] = le.fit_transform(df["rain"])
    X = df[['Temp', 'Hum', 'pres', 'light', 'Uv', 'rain', 'Jahr','monat_sin','monat_cos', 'hour_sin', 'hour_cos']]
    return df, X

def get_rf_prediction(df, X_features, target, timedelta_list):
    results = {}
    for delta in timedelta_list:
        shift = 4 * delta
        y = df[target].shift(-shift).iloc[:-shift]
        X_trimmed = X_features.iloc[:-shift]
        model = RandomForestRegressor(n_estimators=500, max_features=5, random_state=4)
        model.fit(X_trimmed, y)
        current_features = df.iloc[[-1]].drop(columns=DROP_COLS, errors='ignore')[X_features.columns]
        pred = model.predict(current_features)[0]
        results[str(delta)] = float(pred)
    return results

def get_rf_base_cache(df, X_features):
    print("\n--- [RF] Berechne stabilen Basis-Cache (Stunde 1-3) ---")
    cache = {}
    for target in TARGETS:
        cache[target] = get_rf_prediction(df, X_features, target, [1, 2, 3])
    return cache

# --- NEU: STATISTIK & VISUALISIERUNG ---

def calculate_stats(ensemble_data, target_name):
    """Extrahiert alle Kurven für einen Sensor und berechnet Min, Max, Mean."""
    all_y = []
    times = []
    
    for run in ensemble_data:
        sensor_data = next((item for item in run if item["target"] == target_name), None)
        if sensor_data:
            all_y.append(sensor_data["y"][0])
            times = sensor_data["X"]
            
    all_y = np.array(all_y)
    return {
        "times": times,
        "min": np.min(all_y, axis=0).tolist(),
        "max": np.max(all_y, axis=0).tolist(),
        "mean": np.mean(all_y, axis=0).tolist()
    }

def visualize_ensemble(ensemble_data, sensor_target="Temp"):
    """Erstellt ein Profi-Chart mit Farbbereich (Fan Chart)."""
    stats = calculate_stats(ensemble_data, sensor_target)
    
    plt.figure(figsize=(12, 6))
    
    # 1. Den Bereich (Schatten) zeichnen
    plt.fill_between(stats["times"], stats["min"], stats["max"], 
                     color='orange', alpha=0.3, label="Unsicherheitsbereich (Min/Max)")
    
    # 2. Die einzelnen Spaghetti-Kurven (sehr dezent)
    for run in ensemble_data:
        sensor_data = next((item for item in run if item["target"] == sensor_target), None)
        plt.plot(stats["times"], sensor_data["y"][0], color='gray', alpha=0.1, linewidth=0.8)

    # 3. Den Mittelwert (fett gestrichelt)
    plt.plot(stats["times"], stats["mean"], color='darkorange', 
             linestyle='--', linewidth=2.5, label="Mittelwert (Prognose)")
    
    plt.title(f"24h Fan Chart Prognose: {sensor_target} (n={N_ENSEMBLE} Sets)")
    plt.xticks(rotation=45)
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.show()

def LSTM_make_json_output(predictions):
    output_json = []
    for pred_dict in predictions:
        x_axis = [t.split(" ")[-1] for t in pred_dict["times"]]
        output_json.append({
            "target": pred_dict["target"],
            "X": x_axis, 
            "y": [pred_dict["forecast"]],
            "mae": pred_dict["mae"]
        })
    return output_json

# --- HAUPTPROGRAMM ---

if __name__ == "__main__":
    df_rf, X_rf = prepare_rf_data(URL)
    data_lstm = load_and_clean_data(URL)
    rf_cache = get_rf_base_cache(df_rf, X_rf)
    
    all_runs_final = []
    
    for n in range(N_ENSEMBLE):
        print(f"Durchlauf {n+1}/{N_ENSEMBLE}...")
        current_lstm_results = []
        for target in TARGETS:
            res = get_pred(target, data_lstm)
            for h in [1, 2, 3]:
                idx = h - 1
                res["forecast"][idx] = round((rf_cache[target][str(h)] + res["forecast"][idx]) / 2, 2)
            current_lstm_results.append(res)
        
        all_runs_final.append(LSTM_make_json_output(current_lstm_results))

    # Speichern
    os.makedirs("Data", exist_ok=True)
    with open("Data/json_data.json", "w", encoding="utf-8") as f:
        json.dump(all_runs_final, f, ensure_ascii=False, indent=2)

    # Visualisieren
    #visualize_ensemble(all_runs_final, sensor_target="Temp")
    #visualize_ensemble(all_runs_final, sensor_target="Hum")

    print(f"\n[FERTIG] Datei unter Data/json_data.json gespeichert.")



"""
pred_temp = get_prediction("Temp", [1,2,3,4])[0]

#json_data = create_output_json([1])
print(pred_temp)



with open("Data/json_data.json", "w", encoding="utf-8") as f: 
    json.dump(json_data, f, ensure_ascii=False, indent=2)
"""

