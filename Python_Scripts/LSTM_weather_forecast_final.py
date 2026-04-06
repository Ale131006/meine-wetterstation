import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from tensorflow import keras
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error

# --- GLOBAL SETTINGS ---
N_PAST = 96
N_FUTURE = 24
URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRPyrIYSN61zJY9_IUOwtNhRSF1l32Xo2UQjuDYGl3wIMwHjqPdXiIhvBsFhDu6wtyTnSN6qufe1kyA/pub?output=csv"

def load_and_clean_data(url):
    """Lädt Daten und bereitet sie für das Training vor."""
    df = pd.read_csv(url).dropna()
    df['Timestamp'] = pd.to_datetime(df['Timestamp'], format='%d.%m.%Y %H:%M:%S')
    df = df.set_index('Timestamp')
    
    # Resampling
    df_numeric = df.resample('60min').mean(numeric_only=True)
    df_text = df[['rain', 'Ort', 'winddirection']].resample('60min').first()
    
    df = df_numeric.join(df_text).reset_index().dropna()
    drop_cols = ["rain", "Ort", "winddirection", "Longitude", "Latitude", "maxWindSpeed", "Altitude", "windspeed"]
    df = df.drop(columns=[c for c in drop_cols if c in df.columns])
    df["doy"] = df["Timestamp"].dt.dayofyear
    
    # Segmente für Zeitlücken
    df = df.sort_values("Timestamp").reset_index(drop=True)
    df["segment"] = (df["Timestamp"].diff() > pd.Timedelta("2h")).cumsum()
    return df

def prepare_sequences(df, target_col_name):
    """Erstellt X (Features) und y (Zielvariable) Sequenzen."""
    # Zielspalte an erste Position schieben, damit der Scaler konsistent bleibt
    cols = [target_col_name] + [c for c in df.columns if c not in [target_col_name, "Timestamp", "segment"]]
    data_to_scale = df[cols]
    
    scaler = StandardScaler()
    scaled_data = scaler.fit_transform(data_to_scale)
    segments = df["segment"].values
    
    X, y = [], []
    for i in range(N_PAST, len(scaled_data) - N_FUTURE + 1, 1):
        if len(set(segments[i - N_PAST : i + N_FUTURE])) == 1:
            X.append(scaled_data[i - N_PAST : i])
            y.append(scaled_data[i : i + N_FUTURE, 0]) # Zielvariable ist immer Index 0
            
    return np.array(X), np.array(y), scaler, data_to_scale, scaled_data

def train_weather_model(X, y):
    """Baut und trainiert das LSTM Modell."""
    model = Sequential([
        LSTM(64, return_sequences=True, input_shape=(X.shape[1], X.shape[2])),
        LSTM(64, return_sequences=False),
        Dropout(0.2),
        Dense(N_FUTURE)
    ])
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=0.002), loss="mse")
    model.fit(X, y, epochs=15, batch_size=32, verbose=0) # verbose=0 für saubere Konsole
    return model

def get_pred(target_name, df_clean):
    """Trainiert Modell und liefert Vorhersagen, Metriken UND Zeitstempel."""
    print(f"\nBerechne Vorhersage für: {target_name}...")
    
    X, y, scaler, raw_df, scaled_full = prepare_sequences(df_clean, target_name)
    
    # Split für Metrik (90% Training, 10% Test)
    split = int(len(X) * 0.9)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]
    
    model = train_weather_model(X_train, y_train)
    
    # Metrik auf Testdaten
    y_test_pred = model.predict(X_test, verbose=0)
    mae = mean_absolute_error(y_test, y_test_pred)
    
    # Aktuelle Vorhersage für die nächsten 24h
    latest_input = scaled_full[-N_PAST:].reshape(1, N_PAST, -1)
    # Nur einmal predicten!
    forecast_scaled = model.predict(latest_input, verbose=0)[0]
    
    # Hilfsfunktion zur Rückskalierung
    def unscale(val):
        dummy = np.zeros((1, raw_df.shape[1]))
        dummy[0, 0] = val
        res = scaler.inverse_transform(dummy)[0, 0]
        # Falls res ein numpy-Typ ist, zu float konvertieren
        return float(res)
    
    # Werte und Zeiten generieren
    jetzt_ts = df_clean["Timestamp"].iloc[-1]

    # 1. Forecast als saubere Floats
    forecast_values = [round(unscale(v), 2) for v in forecast_scaled]
    
    # 2. Times als saubere Strings
    forecast_times = [(jetzt_ts + pd.Timedelta(hours=i+1)).strftime('%d.%m. %H:%M') for i in range(N_FUTURE)]
    
    # Das fertige Dictionary
    return {
        "target": target_name,
        "forecast": forecast_values,
        "times": forecast_times,
        "mae": round(float(mae), 4), # float() statt .item() ist sicherer
        "unit": "°C" if target_name == "Temp" else "%" if target_name == "Hum" else "",
        "base_time": jetzt_ts.strftime('%d.%m. %Y %H:%M:%S')
    }


def visualize_forecast(pred_data):
    """Visualisierung nutzt jetzt nur noch die Daten aus dem Dictionary."""
    plt.figure(figsize=(12, 5))
    
    # Plotten mit den Zeiten aus dem Dictionary
    plt.plot(pred_data["times"], pred_data["forecast"], 
             marker='o', color='forestgreen', label=f"Prognose {pred_data['target']}")
    
    # Spezifische Punkte markieren (8h, 14h, 24h)
    for i in [7, 13, 23]:
        plt.annotate(f"{pred_data['forecast'][i]:.1f}{pred_data['unit']}", 
                     (pred_data["times"][i], pred_data["forecast"][i]),
                     textcoords="offset points", xytext=(0,10), ha='center', fontweight='bold')
    
    plt.title(f"24h Prognose: {pred_data['target']} (MAE: {pred_data['mae']:.2f}{pred_data['unit']})")
    plt.xlabel("Zeitverlauf")
    plt.ylabel(f"Wert in {pred_data['unit']}")
    plt.grid(True, alpha=0.3, linestyle='--')
    plt.xticks(rotation=35)
    plt.legend()
    plt.tight_layout()
    plt.show()

# --- HAUPTPROGRAMM ---

if __name__ == "__main__":
    data = load_and_clean_data(URL)

    # Aufruf für Temperatur
    res_temp = get_pred("Temp", data)
    print(f"MAE Temperatur: {res_temp['mae']:.2f}°C")

    # Aufruf für Luftfeuchtigkeit
    res_hum = get_pred("Hum", data)
    print(f"MAE Luftfeuchtigkeit: {res_hum['mae']:.2f}%")

    # Aufruf für Luftdruck
    res_pres = get_pred("pres", data)
    print(f"MAE Luftdruck: {res_pres['mae']:.2f} hPa")

    res_light = get_pred("light", data)
    print(f"MAE Licht: {res_light['mae']:.2f} Lux")

    res_uv = get_pred("Uv", data)
    print(f"MAE UV-Index: {res_uv['mae']:.2f}")

    print(res_temp)

    # Visualisierung nach Bedarf
    visualize_forecast(res_temp)
    visualize_forecast(res_hum)
    visualize_forecast(res_pres)
    visualize_forecast(res_light)
    visualize_forecast(res_uv)