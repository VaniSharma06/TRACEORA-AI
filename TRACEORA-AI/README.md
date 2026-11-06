# TRACEORA AI — submission package

Evidence-first pharmaceutical investigation prototype. Backend uses PostgreSQL and Groq through a LangGraph workflow. Frontend supports incident intake, PDF/TXT/MD/CSV upload, editable investigation findings, CAPA suggestions, and investigation history.

## IMPORTANT: preserve your own credentials

1. In `backend`, copy `.env.example` and rename the copy to `.env`.
2. Put your own Groq key and PostgreSQL password in `.env`.
3. The model ID must be exactly `openai/gpt-oss-120b` (note **gpt**, not **gp**).
4. Never share or submit `.env`; it contains secrets.

If you already have a working `.env`, keep it and only correct the `GROQ_MODEL` line. Do not replace it with `.env.example`.

## Run backend (PyCharm terminal)

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Backend docs: http://127.0.0.1:8000/docs
Health check: http://127.0.0.1:8000/api/health

Expected health response includes `connected (PostgreSQL)` and model `openai/gpt-oss-120b`.

## Run frontend (second terminal)

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally http://localhost:5173).

## Demo test data (synthetic)

Batch BATCH-104 showed moisture content above the approved specification during quality testing. The batch was manufactured using dryer DR-02. The investigation team needs to identify possible causes and missing evidence before deciding corrective actions.

## Honest prototype limitations

- This is a prototype, not a validated GMP system and not a substitute for qualified quality review.
- PDF extraction reads selectable text; scanned PDFs need OCR, which is not included.
- The LangGraph workflow currently has one Groq-powered analysis node; advanced multi-agent orchestration, evidence graph visualization, and counterfactual testing are not implemented in this package.
- PostgreSQL tables are created on backend startup; this package does not migrate existing SQLite records.
- Do not use real confidential manufacturing records in a public demonstration.
