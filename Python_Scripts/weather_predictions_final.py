import pickle
import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error
import math
import seaborn as sns
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
import os
from datetime import datetime, timedelta
import json
import pytz

#Load the dataset into Python

url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRPyrIYSN61zJY9_IUOwtNhRSF1l32Xo2UQjuDYGl3wIMwHjqPdXiIhvBsFhDu6wtyTnSN6qufe1kyA/pub?output=csv"
dropcolumns = ["Timestamp", 'Altitude', 'maxWindSpeed', 'windspeed', 'Latitude', 'Longitude','Ort','winddirection', 'Monat', 'Tag','Stunde']
df = pd.read_csv(url)

df.to_csv("Data/weather_data.csv", index=False)

df = df.dropna()

#clean Data for quarter hour average

df['Timestamp'] = pd.to_datetime(df['Timestamp'], format='%d.%m.%Y %H:%M:%S')

df = df.set_index('Timestamp')

# Numerische Spalten mitteln
numeric_cols = ['Temp', 'Hum', 'pres']  # deine numerischen Spalten
df_numeric = df.resample('15min').mean(numeric_only=True)

# Text-/Kategorie-Spalten: einfach ersten Wert im Fenster nehmen
text_cols = ['rain', 'Ort', 'winddirection']  # deine Text-Spalten
df_text = df[text_cols].resample('15min').first()

# Zusammenführen
df = df_numeric.join(df_text)

df = df.reset_index()
df = df.dropna()


#Prepare the dataset for modeling  (Zeit und Monate als Sinus/Cosinus darstellen. Monate als eigene Spalte)

df['Jahr']   = df['Timestamp'].dt.year
df['Monat']  = df['Timestamp'].dt.month
df['Tag']    = df['Timestamp'].dt.day
df['Stunde'] = df['Timestamp'].dt.hour

df["monat_sin"] = np.sin(2*math.pi * df["Timestamp"].dt.month/12)
df["monat_cos"] = np.cos(2*math.pi * df["Timestamp"].dt.month/12)

df["hour_sin"] = np.sin(2*math.pi * df["Timestamp"].dt.hour/24)
df["hour_cos"] = np.cos(2*math.pi * df["Timestamp"].dt.hour/24)

le = LabelEncoder()
df["rain"] = le.fit_transform(df["rain"])


X = df[['Temp', 'Hum', 'pres', 'light', 'Uv', 'rain', 'Jahr','monat_sin','monat_cos', 'hour_sin', 'hour_cos']]

#Aussortiere features ("Timestamp", 'Altitude', 'maxWindSpeed', 'windspeed', 'Latitude', 'Longitude','Ort','winddirection', 'Monat', 'Tag','Stunde',)

def prepare_training_data(feature, timedelta):
    shift = 4*timedelta
    y = df[feature].shift(-shift).iloc[:-shift]
    X_trimmed = X.iloc[:-shift]
    X_train, X_test, y_train, y_test = train_test_split(X_trimmed,y, test_size=0.05, random_state=4)

    return X_train, X_test, y_train, y_test

def train_model(X_train, y_train):
    model = RandomForestRegressor(n_estimators=1500, max_features=5, oob_score=True, random_state=4) #max_samples = 60 #n_estimators = 2000, max_features =6
    model.fit(X_train, y_train)
    return model

def get_prediction(feature, timedelta=[1,4,8,24]):
    predictions = {}
    for delta in timedelta:
        X_train, X_test, y_train, y_test = prepare_training_data(feature, delta)
        model = train_model(X_train, y_train)
        print(f"Model trained for {feature} with timedelta {delta} hours.")

        current = df.iloc[[-1]]
        current = current.drop(columns=dropcolumns)

        prediction = model.predict(current)

        predictions[f"{delta}"] = f"{prediction}"

    return predictions, X_test, y_test

#temp_pred = get_prediction("Temp", [1,4])[0]
#print(temp_pred)

def get_all_predictions(timedelta=[1,4,8,24]):
    pred_temp = get_prediction("Temp", timedelta)[0]
    pred_hum = get_prediction("Hum", timedelta)[0]
    pred_pres = get_prediction("pres", timedelta)[0]
    pred_light = get_prediction("light", timedelta)[0]
    pred_uv = get_prediction("Uv", timedelta)[0]
    return [pred_temp, pred_hum, pred_pres, pred_light, pred_uv]

def create_output_json(timedelta=[1,4,8,24]):
    predictions = get_all_predictions(timedelta)
    weather_data = []                   #y

    for prediction in predictions:
        weather_data.append([prediction])

    x = create_x_axis(timedelta)

    output_json = []
    
    for data in weather_data:
        output_json.append({"X": x, "y": data})

    return output_json

def create_x_axis(times):
    timezone = pytz.timezone("Europe/Berlin")
    now = datetime.now(timezone)
    next_hour = now + timedelta(hours=0)  #veränderbar/anpasse /TODO
    next_hour = next_hour.replace(minute=0, second=0, microsecond=0)

    future_times = [(next_hour + timedelta(hours=i)).strftime("%H:00") for i in times]

    return future_times


json_data = create_output_json([1])


with open("Data/json_data.json", "w", encoding="utf-8") as f: 
    json.dump(json_data, f, ensure_ascii=False, indent=2)


    
#-----------------LSTM einfügen-----------------

from LSTM_weather_forecast_final import get_pred, visualize_forecast, load_and_clean_data
# --- HAUPTPROGRAMM ---

if __name__ == "__main__":
    data = load_and_clean_data(url)

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









#Random Forest und LSTM anaeinander anpassen

#In Website einbauen

