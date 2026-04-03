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
import datetime
import json

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
    model = RandomForestRegressor(n_estimators=2000, max_features=6, oob_score=True, random_state=4) #max_samples = 60
    model.fit(X_train, y_train)
    return model

def get_prediction(feature, timedelta=[1,4,8,24]):
    predictions = {}
    for delta in timedelta:
        X_train, X_test, y_train, y_test = prepare_training_data(feature, delta)
        model = train_model(X_train, y_train)

        current = df.iloc[[-1]]
        current = current.drop(columns=dropcolumns)

        prediction = model.predict(current)

        predictions[f"{delta}"] = f"{prediction}"

    return predictions, X_test, y_test

temp_pred = get_prediction("Temp", [1,4])[0]
print(temp_pred)

def get_all_predictions(timedelta=[1,4,8,24]):
    pred_temp = get_prediction("Temp", timedelta)[0]
    pred_hum = get_prediction("Hum", timedelta)
    pred_pres = get_prediction("pres", timedelta)
    pred_light = get_prediction("light", timedelta)
    pred_uv = get_prediction("Uv", timedelta)


history_data = [
    {"time": "2026-04-03T12:17:00Z", "temperature": 20.8},
    {"time": "2026-04-03T13:17:00Z", "temperature": 21.1},
    {"time": "2026-04-03T14:17:00Z", "temperature": 20.5}
]

with open("Data/json_data.json", "w", encoding="utf-8") as f: 
    json.dump(history_data, f, ensure_ascii=False, indent=2)


    
    


#Model verbessern (letzte 3-5 Datensätze mitgeben, wird abwechselnd wärmer und kälter,  )
#Testen, visulisieren
#In Website einbauen

##Schönes design, wenn am ende mehrere Möglichkeiten sind, grösserer Balken, ausschweifend(random_state entfernen)




def testing(feature, timedelta=[1,4,8,24]):
    prediction = get_prediction(feature, timedelta)
    X_test = prediction[1]
    y_test = prediction[2]
    y_pred = prediction[0]

    mae = mean_absolute_error(y_true=y_test, y_pred=y_pred)
    print(f"Mean average Error: {mae}")

    fix, ax = plt.subplots(figsize=(10,5))

    sns.scatterplot(x=y_test, y= y_test, ax = ax)
    sns.scatterplot(x=y_test, y=y_pred, ax=ax)
    plt.show()

#testing("Temp")  Gibt fehler
