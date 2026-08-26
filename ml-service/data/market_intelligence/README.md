# AgroSphere market-v1 data

This folder contains a small, curated set of **historical** Indian mandi price
observations. It is not a live price feed and must never be presented as current
market data.

## Provenance

- Official origin: AGMARKNET, Directorate of Marketing and Inspection, Ministry
  of Agriculture and Farmers Welfare, Government of India.
- Official catalog: <https://www.data.gov.in/catalog/current-daily-price-various-commodities-various-markets-mandi>
- Public archive used for reproducibility: <https://github.com/vardhaman-rp/AGMARKNET_Commodity_price_ETL_POSTGRES/blob/main/Data.zip>
- Archive retrieved for Task 6 on 2026-08-25.
- Underlying government-data license: Government Open Data License - India
  (OGDL), <https://data.gov.in/sites/default/files/Gazette_Notification_OGDL.pdf>.
- License caveat: the public archive repository does not publish a separate
  license. AgroSphere attributes the underlying records to AGMARKNET and links
  both the official catalog and the archive actually used.

The official data.gov.in API requires an authorized key. The AGMARKNET 2.0 API
also returned HTTP 403 during feasibility testing. For that reason market-v1 uses
this local historical subset and has no runtime dependency on either service.

## Supported historical scope

| Commodity | Market | District, State | Variety | Date range | Records |
| --- | --- | --- | --- | --- | ---: |
| Tomato | Pune | Pune, Maharashtra | Local | 2021-01-14 to 2021-06-30 | 78 |
| Maize | Pune | Pune, Maharashtra | Deshi Red | 2021-01-14 to 2021-06-30 | 77 |
| Groundnut | Laxmeshwar | Gadag, Karnataka | Balli/Habbu | 2021-01-15 to 2021-06-30 | 71 |

All prices are INR per quintal. The dataset exposes minimum, maximum, and modal
price. AgroSphere uses modal price as the primary reference because it represents
the most commonly quoted price for that market observation; it does not average
the three price types.

## Reproduce the curated files

Download and extract `Data.zip`, then run from `ml-service`:

```powershell
python training/prepare_market_data.py --source-path "C:\path\to\Data\data.csv"
```

The script validates the raw schema, parses the two documented date formats,
validates numeric prices, enforces
`0 < minimum <= modal <= maximum`, removes exact repeated observations, and
writes both the curated CSV and metadata JSON. The raw archive has 913,929 rows;
258 rows match the supported scope, 32 exact duplicates are removed, and 226
observations remain. No synthetic prices are added.

## Important limitations

- The latest observation is 2021-06-30, so the records are stale historical
  context, not present-day price guidance.
- Only the exact commodity, market, and variety combinations listed above are
  supported.
- Observations are irregular trading-day records, not a continuous daily time
  series.
- Six months of old data is not sufficient for a defensible current or future
  price forecast. market-v1 therefore reports forecasting as unavailable.
- Prices do not represent a guaranteed farmer realization and exclude quality,
  buyer negotiation, fees, and logistics.
