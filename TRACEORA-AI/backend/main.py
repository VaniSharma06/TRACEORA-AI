import json
import os
import re
from datetime import datetime
from typing import Any, Optional, TypedDict

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Integer, String, Text, create_engine, text as sql_text
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b").strip()

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is missing. Configure a PostgreSQL connection string in backend/.env."
    )
if not DATABASE_URL.startswith(("postgresql://", "postgresql+psycopg://")):
    raise RuntimeError(
        "TRACEORA requires PostgreSQL. Set DATABASE_URL to "
        "postgresql+psycopg://USER:PASSWORD@HOST:5432/DATABASE."
    )
if not GROQ_API_KEY:
    raise RuntimeError(
        "GROQ_API_KEY is missing. Add your Groq API key to backend/.env before starting the server."
    )

# psycopg 3 is used by the postgresql+psycopg URL.
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class Investigation(Base):
    __tablename__ = "investigations"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), default="New investigation")
    source_text = Column(Text, nullable=False)
    result_json = Column(Text, nullable=False)
    status = Column(String(80), default="Pending human review")
    created_at = Column(DateTime, default=datetime.utcnow)


app = FastAPI(
    title="TRACEORA AI",
    description="Evidence-first pharmaceutical root cause investigation",
    version="1.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def create_tables():
    # Fail startup rather than silently switching to a local SQLite database.
    Base.metadata.create_all(bind=engine)


def first_match(source: str, pattern: str):
    match = re.search(pattern, source, re.I)
    return match.group(1) if match else None


class RCAState(TypedDict, total=False):
    source: str
    result: dict[str, Any]


def build_graph():
    """Build and compile a real LangGraph workflow with a Groq-backed node."""
    from langchain_groq import ChatGroq
    from langgraph.graph import END, StateGraph

    def analyze_incident(state: RCAState) -> RCAState:
        llm = ChatGroq(
            api_key=GROQ_API_KEY,
            model=GROQ_MODEL,
            temperature=0,
        )
        prompt = f"""
You are a cautious pharmaceutical quality investigation decision-support assistant.
Analyze the incident text and return ONLY one valid JSON object.

Required keys:
incident_summary,
extracted_fields (batch_id, equipment, process_stage, deviation),
potential_root_causes (array of objects: cause, status, supporting_evidence,
missing_evidence, questions),
five_whys (array of objects),
fishbone (object with Man, Machine, Method, Material, Measurement, Environment arrays),
missing_evidence (array),
risk_assessment (object),
capa_recommendations (array of objects: type, action, verification),
review_checklist (array),
human_review_required (boolean).

Rules:
- Treat all suspected causes as hypotheses unless the supplied evidence proves otherwise.
- Never invent facts, batch details, page references, limits, risk scores, or approvals.
- Clearly distinguish supplied evidence from missing evidence.
- Require qualified human review. Do not claim GMP validation or regulatory compliance.
- Keep recommendations evidence-based and practical.

Incident text:
{state["source"][:12000]}
"""
        response = llm.invoke(prompt)
        raw = response.content if isinstance(response.content, str) else str(response.content)
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.I)
        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            start, end = raw.find("{"), raw.rfind("}")
            if start < 0 or end <= start:
                raise ValueError("Groq did not return a valid JSON object.")
            result = json.loads(raw[start : end + 1])

        required = [
            "incident_summary", "extracted_fields", "potential_root_causes",
            "five_whys", "fishbone", "missing_evidence", "risk_assessment",
            "capa_recommendations", "review_checklist",
        ]
        missing = [key for key in required if key not in result]
        if missing:
            raise ValueError("Groq response is missing required fields: " + ", ".join(missing))

        result["human_review_required"] = True
        result["mode"] = f"Groq + LangGraph ({GROQ_MODEL})"
        return {"source": state["source"], "result": result}

    graph = StateGraph(RCAState)
    graph.add_node("analyze_incident", analyze_incident)
    graph.set_entry_point("analyze_incident")
    graph.add_edge("analyze_incident", END)
    return graph.compile()


RCA_GRAPH = build_graph()


async def extract_text(upload: UploadFile) -> str:
    filename = (upload.filename or "").lower()
    content = await upload.read()

    if filename.endswith(".pdf"):
        try:
            import fitz
            document = fitz.open(stream=content, filetype="pdf")
            extracted = "\n".join(page.get_text() for page in document)
            if not extracted.strip():
                raise HTTPException(
                    status_code=422,
                    detail="This PDF contains no selectable text. Scanned PDFs need OCR before analysis.",
                )
            return extracted
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not read PDF: {exc}")

    if filename.endswith((".txt", ".md", ".csv")):
        return content.decode("utf-8", errors="ignore")

    raise HTTPException(status_code=400, detail="Supported files: PDF, TXT, MD or CSV.")


@app.get("/")
def home():
    return {"product": "TRACEORA AI", "status": "running", "docs": "/docs"}


@app.get("/api/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(sql_text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected (PostgreSQL)",
            "ai": "configured (Groq)",
            "groq_model": GROQ_MODEL,
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"PostgreSQL connection failed: {exc}")


@app.post("/api/analyze")
async def analyze(text: str = Form(""), file: Optional[UploadFile] = File(None)):
    source = text.strip()
    if file:
        extracted = await extract_text(file)
        source = (source + "\n\n" + extracted).strip()

    if len(source) < 20:
        raise HTTPException(
            status_code=400,
            detail="Please provide an incident description or upload a report with readable text.",
        )

    # No silent rules-based fallback: failures are returned clearly to the caller.
    try:
        result = RCA_GRAPH.invoke({"source": source})
        analysis = result["result"]
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Groq/LangGraph analysis failed. Check the Groq key, model and network. Details: {str(exc)[:300]}",
        )

    db = SessionLocal()
    try:
        fields = analysis.get("extracted_fields") or {}
        title = str(fields.get("deviation") or "Quality investigation")[:200]
        item = Investigation(
            title=title,
            source_text=source,
            result_json=json.dumps(analysis),
            status="Pending human review",
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        analysis["investigation_id"] = item.id
        return analysis
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Could not save investigation to PostgreSQL: {exc}")
    finally:
        db.close()


@app.get("/api/investigations")
def list_investigations():
    db = SessionLocal()
    try:
        rows = db.query(Investigation).order_by(Investigation.created_at.desc()).limit(50).all()
        return [
            {
                "id": row.id,
                "title": row.title,
                "status": row.status,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    finally:
        db.close()


@app.get("/api/investigations/{investigation_id}")
def get_investigation(investigation_id: int):
    db = SessionLocal()
    try:
        row = db.query(Investigation).filter(Investigation.id == investigation_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Investigation not found.")
        return {
            "id": row.id,
            "source_text": row.source_text,
            "result": json.loads(row.result_json),
            "status": row.status,
        }
    finally:
        db.close()


class ReviewPayload(BaseModel):
    result: dict
    status: str = "Reviewed – pending qualified approval"


@app.put("/api/investigations/{investigation_id}/review")
def save_review(investigation_id: int, payload: ReviewPayload):
    db = SessionLocal()
    try:
        row = db.query(Investigation).filter(Investigation.id == investigation_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Investigation not found.")
        row.result_json = json.dumps(payload.result)
        row.status = payload.status
        db.commit()
        return {"saved": True, "id": row.id, "status": row.status}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
