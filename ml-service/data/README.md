# Crop Recommendation Dataset

## Source

- Dataset: **Crop Recommendation Dataset**
- Creator/publisher: Atharva Ingle
- Source: https://www.kaggle.com/datasets/atharvaingle/crop-recommendation-dataset
- License shown by the source: Apache 2.0
- Retrieved: 2026-08-24
- Local file: `crop_recommendation.csv`
- SHA-256: `54A5A6E5408668E668667EFC50DE2FC867C1B875E0431B4F54DD331B0A109A4E`

The source describes the dataset as an augmentation of rainfall, climate, and fertilizer data available for India.

## Contents

The CSV contains 2,200 rows, seven numeric input features, and one crop label. It has 22 crop classes with 100 rows per class.

| Column | Source description / unit |
| --- | --- |
| `N` | Ratio of nitrogen content in soil; the source does not state a measurement unit |
| `P` | Ratio of phosphorus content in soil; the source does not state a measurement unit |
| `K` | Ratio of potassium content in soil; the source does not state a measurement unit |
| `temperature` | Degrees Celsius |
| `humidity` | Relative humidity, percent |
| `ph` | Soil pH, unitless |
| `rainfall` | Millimetres |
| `label` | Recommended crop class |

## Known limitations

- The original data card does not define physical units for N, P, or K, so AgroSphere labels them as dataset-scale soil values rather than inventing units.
- The dataset is balanced by construction and does not represent real-world crop prevalence.
- It has no farm identifier, geography, season, soil type, yield, cost, market price, or observed success outcome.
- Its 22 labels are the only crops the model can recommend.
- It is an augmented dataset, not an independently validated field trial for a specific farm.
