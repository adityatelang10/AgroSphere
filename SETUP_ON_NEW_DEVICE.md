# AgroSphere: setup on a new device

This portable source package was prepared on 27 September 2026 from the current
working tree, including uncommitted changes. It is not a Git checkout, a database
backup, or an installed application. Application behavior was not changed for
packaging. Use this guide's portable paths instead of the original machine paths
shown in older verification documents.

## 1. Prerequisites

- Windows 10/11, 64-bit, with PowerShell. The code can also be installed on other
  supported systems using their equivalent shell/virtual-environment commands.
- **Node.js 24 LTS** with its bundled npm is recommended for a new installation.
  The backend declares Node >=20; the source machine has Node 25.1.0 / npm 11.6.2.
  Node 25 is now end-of-life, so it is not the recommendation for the new machine.
  Check the [official Node release table](https://nodejs.org/en/about/previous-releases).
- **Python 3.12, 64-bit** is recommended to match the source environment
  (3.12.10). Install Python with the Windows `py` launcher. Do not copy `.venv`
  from another computer. A GPU is not required; disease inference uses the CPU.
- **MongoDB Community Server** locally, or your own MongoDB Atlas connection.
  MongoDB Compass alone is not the database server. Database Tools are optional
  and are needed only for a separately approved export/import.
- Internet access to install dependencies and use external services.
- Git is optional; `.git` and stashes are not included.

The Python environment and PyTorch installation can use several GB of disk space,
even though this ZIP is small. If a native package cannot find a compatible wheel,
check Python architecture/version before attempting to compile it.

## 2. Extract and understand the folders

Extract the ZIP into a folder you own, for example `C:\Projects`. The ZIP contains
one `AgroSphere` folder. Run commands from that folder, not from the ZIP viewer.

```text
AgroSphere/
  frontend/                    React/Vite source, package files, tests
    public/images/landing/     Local landing-page photographs and credits
    .env.example               Public API/socket URL configuration
  backend/                     Express, Socket.IO, MongoDB models, tests
    .env.example               Backend-only service/credential placeholders
  ml-service/                  FastAPI application, training source, tests
    app/data/                  Irrigation configuration
    model_artifacts/           Saved crop/disease models and OOD artifacts
    data/                      Crop CSV, historical mandi data, dataset metadata
    requirements.txt           Python dependency ranges
    .env.example               Model paths and service configuration
  SETUP_ON_NEW_DEVICE.md
```

The package includes `crop_model.joblib`, `crop_model_metadata.json`,
`disease_model.pt`, `disease_classes.json`, `disease_model_metadata.json`, and
`disease_ood_metadata.npz`. Additional existing OOD research/reference artifacts
are preserved as well. Runtime uses the selected OOD metadata, not a new model.
The irrigation JSON and historical AGMARKNET CSV/metadata are included.

The downloaded PlantVillage `train`, `validation`, and `test` image folders are
not included. Their README, manifest, and preparation/training scripts are included.
These images are not required to serve the saved models. Tests that need missing
local test images may skip; full retraining/evaluation needs the dataset again:

```powershell
# Optional, from ml-service with its environment active; not needed for startup:
python -m training.prepare_disease_dataset
```

This downloads the documented subset. It does not train a new model. Do not run
training/calibration commands merely to start AgroSphere. Some older research
reports contain original-machine paths for historical provenance; these are not
runtime dependencies. Read `ml-service/data/plant_disease/README.md` for licensing.

## 3. Environment setup

From the extracted project root, make these files **once**. Do not overwrite a
previously configured `.env` on a later run.

```powershell
Set-Location 'C:\Projects\AgroSphere'  # Replace with your extraction location.
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
Copy-Item ml-service\.env.example ml-service\.env
```

Edit the new `.env` files privately. No real credentials are supplied. All SMTP,
database, Cloudinary, payment and Gemini credentials belong in **backend/.env**.
Never put secrets in frontend variables: every `VITE_*` value is public to users.

### Backend variable names

| Purpose | Variable names | When needed |
|---|---|---|
| Core server/auth | `PORT`, `NODE_ENV`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL` | Configure before first use; use a new strong random JWT secret, not the example placeholder. |
| ML connection | `ML_SERVICE_URL`, `ML_SERVICE_TIMEOUT_MS` | AI features; existing local defaults are in the example. |
| SMTP recovery | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Sending password-reset/change emails. |
| Images | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Uploads to your Cloudinary account. |
| Gemini Copilot | `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini features; optional `GOOGLE_API_KEY` is a fallback, not an additional required key. |
| Latest mandi prices | `DATA_GOV_API_KEY` | Latest reported prices from the data.gov.in AGMARKNET resource. |
| Test payments | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_MODE` | A matching Razorpay TEST key pair; this project rejects live mode. |

`CLIENT_URL` must match the browser origin, normally `http://localhost:5173`.
Keep cookie/credential CORS restricted to that origin. Use development mode for
local HTTP. Production needs HTTPS and separately configured secure origins.
The ML timeout is configurable; increase it only if real inference is slower on
the new hardware. No credentials should be put into a URL shown in the browser.

### SMTP choices

The existing backend example uses **Brevo SMTP**. Configure your Brevo SMTP login,
SMTP key and a verified sender privately. A Brevo API key is not necessarily the
SMTP credential. The current mail code also supports another authenticated SMTP
provider, including Gmail.

For Gmail, the following is **placeholder configuration only**, not real credentials:

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<gmail>
SMTP_PASS=<Google App Password>
SMTP_FROM=<gmail>
```

For port 587, `false` means STARTTLS, not unencrypted delivery: this application
requires TLS when the secure flag is false. Gmail App Passwords normally require
2-Step Verification and may be unavailable under some account policies. Use an
App Password, not your ordinary Gmail password. See
[Google's App Password instructions](https://support.google.com/accounts/answer/185833).
The recipient must have access to the email used for their AgroSphere account.

### Frontend variable names

- `VITE_API_BASE_URL`
- `VITE_API_SOCKET_URL`

Both default to the local Node server on port 5000 in current source. Keep the
provided local examples for a same-computer demonstration. Restart Vite after
changing these values. React calls Node, never FastAPI directly.

### ML-service variable names

`SERVICE_NAME`, `SERVICE_HOST`, `SERVICE_PORT`, `SERVICE_RELOAD`,
`CROP_MODEL_PATH`, `CROP_MODEL_METADATA_PATH`, `DISEASE_MODEL_PATH`,
`DISEASE_CLASSES_PATH`, `DISEASE_OOD_PATH`, `DISEASE_MODEL_METADATA_PATH`,
`IRRIGATION_CONFIG_PATH`, `MARKET_DATA_PATH`, `MARKET_DATA_METADATA_PATH`.

Keep the relative paths in `ml-service/.env.example`. They resolve inside the
extracted service folder. No API keys are required in the ML service. When using
the explicit Uvicorn command below, its host/port arguments determine the listener.

## 4. Install dependencies

In PowerShell, from the extracted project root:

```powershell
Set-Location backend
npm ci
Set-Location ..\frontend
npm ci
Set-Location ..\ml-service
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

`npm ci` uses the supplied lockfiles; do not run `npm audit fix --force` as a setup
step. If activation is restricted, use `.\.venv\Scripts\python.exe` instead of
`python` for each Python command; no permanent execution-policy change is needed.

The Python requirements contain version ranges, not a full lock. For closer
reproduction of the currently installed, locally working model environment,
install these observed versions **after** the requirements command:

```powershell
python -m pip install "numpy==2.5.2" "scikit-learn==1.9.0" "joblib==1.5.3" "pandas==3.0.5" "torch==2.13.0" "torchvision==0.28.0" "fastapi==0.141.1" "uvicorn==0.52.4" "pydantic-settings==2.15.0" "pillow==12.3.0" "python-multipart==0.0.32"
python -m pip check
```

These are observed installed versions, not fabricated training-version metadata.
Cross-version scikit-learn model loading is not guaranteed; investigate warnings
instead of ignoring them. See the
[scikit-learn persistence guidance](https://scikit-learn.org/stable/model_persistence.html).
Only load model artifacts you trust. Keep PyTorch and torchvision versions paired.
On Windows, a PyTorch DLL-load error may require the Microsoft Visual C++ 2015–2022
64-bit Redistributable and a fresh Python 3.12 environment. Do not copy DLLs from
untrusted downloads or change application code to work around a broken environment.
For native bcrypt build errors, first use supported 64-bit Node LTS; compiler tools
may be needed if the package cannot download a prebuilt binary.

## 5. Start in this order

### MongoDB first

If MongoDB Community was installed as a Windows service, check/start it in an
Administrator PowerShell if needed:

```powershell
Get-Service MongoDB
Start-Service MongoDB
```

Do not start a second database process if it is already running. For a manual
installation, create a dedicated writable database-data directory and use the
installed `mongod` executable:

```powershell
# Substitute an existing, dedicated data directory; keep it outside source code.
mongod --dbpath 'C:\MongoData\AgroSphere' --bind_ip 127.0.0.1 --port 27017
```

For Atlas, no local MongoDB process is needed. Configure your own connection string
in `MONGO_URI`, database user permissions, and appropriate network access privately.

### Terminal 1: FastAPI

```powershell
Set-Location 'C:\Projects\AgroSphere\ml-service'
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health: <http://127.0.0.1:8000/health>. Model artifacts load at startup, not training.
Check the terminal for unavailable-model errors: basic health alone does not prove
every model is ready. Keep FastAPI running while testing AI features.

### Terminal 2: Node / Express

```powershell
Set-Location 'C:\Projects\AgroSphere\backend'
npm run dev
```

Use `npm start` instead for a server without nodemon. Health:
<http://localhost:5000/api/health>; ML connection:
<http://localhost:5000/api/ai/health>. Node must connect to MongoDB before listening.

### Terminal 3: React / Vite

```powershell
Set-Location 'C:\Projects\AgroSphere\frontend'
npm run dev
```

Open <http://localhost:5173>. Vite is intentionally strict on port 5173. If occupied,
identify the owning process before stopping it; do not switch to 5174 or kill every
Node process. A frontend production-build check is `npm run build` in `frontend`.
`dist` is intentionally not included and is recreated by this command.

## 6. First run, database and images

No MongoDB export, user accounts, passwords, sessions, orders, payment attempts,
cart state, AI history or demo records are packaged. No standalone demo seed/export
was found. Test fixtures are not seed data. A new database starts empty; register
your own FARMER/CUSTOMER accounts and enter your own demonstration data.

To transfer existing demo data, arrange a **separate, authorized** MongoDB export
and import using Database Tools. Such an export contains personal data and must be
handled privately; this packaging task did not export or change the database.
Connecting to the original Atlas database shares live data; prefer a separate
database unless shared use is intentional.

Cloudinary-hosted crop/profile/gallery images are not local source files and are
not downloaded into this ZIP. Existing image URLs depend on the original hosted
assets remaining available. New uploads need your configured Cloudinary account.
Landing-page photographs are local and included, with their source credits.

QR links use the browser's application origin. A localhost QR works only on that
computer. A physical phone needs a reachable deployment or deliberately configured
LAN setup; do not broaden CORS to all origins just to demonstrate it.

## 7. External/network requirements

- SMTP password recovery: internet, correct SMTP credentials and a permitted sender.
- Cloudinary uploads: internet and the account's image-upload credentials.
- Weather: Open-Meteo forecast/geocoding access; no key is used by current code.
- Latest mandi prices: internet and `DATA_GOV_API_KEY`. Historical market analysis
  instead uses the bundled historical CSV; those prices are not live quotes.
- Razorpay: internet, dashboard TEST configuration and matching TEST keys. This
  project supports test checkout only. No real payment credentials are bundled.
- Gemini Copilot: internet, a valid key and access to the configured model.
- Web fonts use Google Fonts where reachable; CSS supplies system-font fallbacks.

The saved crop/disease models and local irrigation/historical-market calculations
do not need a model download at inference time. Browser microphone permissions and
speech-recognition service availability can affect voice features independently.

## 8. Package verification scope

The source/lockfiles, relative imports, required runtime assets and models were
checked during packaging. npm install plans were checked with an offline dry run;
that is not a clean-machine installation or a guarantee that every network service
will work. Python models were checked from a relocated staging copy using the
source machine's installed Python dependencies; the environment itself is not
included. Run the installation and health checks above on the second computer.

The ZIP excludes actual `.env` files, dependencies, virtual environments, build
outputs, caches, logs, OS/IDE files, `.git`, and downloaded training-image splits.
Environment examples and this setup guide are included. No application source
behavior, database content, Git history or stash was changed for packaging.
