# Start AgroSphere Locally

## Prerequisites

- Node.js 20 or newer
- Python 3.11 or newer
- MongoDB running locally
- The existing model artifacts in `ml-service/model_artifacts/`

Create local environment files once and fill in your own private values. Never commit them:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item ml-service\.env.example ml-service\.env
```

Install dependencies once:

```powershell
cd C:\Users\adity\OneDrive\Desktop\AgroSphere\ml-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

cd ..\backend
npm install

cd ..\frontend
npm install
```

## Terminal 1 — FastAPI

```powershell
cd C:\Users\adity\OneDrive\Desktop\AgroSphere\ml-service
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health check: <http://127.0.0.1:8000/health>

## Terminal 2 — Node / Express

```powershell
cd C:\Users\adity\OneDrive\Desktop\AgroSphere\backend
npm run dev
```

Health checks:

- <http://localhost:5000/api/health>
- <http://localhost:5000/api/ai/health>

## Terminal 3 — React

```powershell
cd C:\Users\adity\OneDrive\Desktop\AgroSphere\frontend
npm run dev
```

Open <http://localhost:5173>.

FastAPI is required for new crop, disease, irrigation, and market requests. Authentication, marketplace, orders, stored decisions, What-If, and the intelligence dashboard remain Node/MongoDB features.
