import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setResult } from './store';
import { Activity, ShieldCheck, FileUp, Search, GitBranch, ClipboardCheck, History, AlertTriangle, CheckCircle2, Plus, Save, RefreshCw, ArrowLeft } from 'lucide-react';

const API = 'http://127.0.0.1:8000';
const NAV = [
  { id: 'command', label: 'Command Center', Icon: Activity },
  { id: 'new', label: 'New Investigation', Icon: FileUp },
  { id: 'evidence', label: 'Evidence & RCA', Icon: GitBranch },
  { id: 'capa', label: 'CAPA Studio', Icon: ClipboardCheck },
  { id: 'history', label: 'Investigation History', Icon: History },
];
const blankResult = { incident_summary: '', extracted_fields: {}, potential_root_causes: [], missing_evidence: [], capa_recommendations: [], five_whys: [], fishbone: {}, human_review_required: true };

export default function App() {
  const [page, setPage] = useState('command');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState([]);
  const dispatch = useDispatch();
  const result = useSelector(s => s.app.result);

  async function loadHistory() {
    try {
      const response = await fetch(`${API}/api/investigations`);
      if (!response.ok) throw new Error('Could not load investigation history');
      setHistory(await response.json());
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { loadHistory(); }, []);

  async function analyze(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const fd = new FormData(); fd.append('text', text); if (file) fd.append('file', file);
      const response = await fetch(`${API}/api/analyze`, { method: 'POST', body: fd });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Analysis failed');
      dispatch(setResult(data)); setPage('evidence'); setNotice('Investigation analyzed and stored in PostgreSQL.');
      await loadHistory();
    } catch (e) { setError(`${e.message}. Check that the backend is running at http://127.0.0.1:8000.`); }
    finally { setBusy(false); }
  }

  function updateResult(path, value) {
    const copy = structuredClone(result || blankResult);
    let target = copy;
    for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
    target[path[path.length - 1]] = value;
    dispatch(setResult(copy));
  }
  async function saveReview() {
    if (!result?.investigation_id) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch(`${API}/api/investigations/${result.investigation_id}/review`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result, status: 'Edited – pending qualified approval' })
      });
      const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Save failed');
      setNotice('Your edited AI results have been saved to the database. Qualified approval is still required.');
      await loadHistory();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }
  async function openInvestigation(id) {
    setError(''); setNotice('');
    try {
      const response = await fetch(`${API}/api/investigations/${id}`); const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not open investigation');
      dispatch(setResult({ ...data.result, investigation_id: data.id })); setPage('evidence');
    } catch (e) { setError(e.message); }
  }

  const causes = result?.potential_root_causes || [];
  const capa = result?.capa_recommendations || [];
  const title = NAV.find(n => n.id === page)?.label || 'Command Center';

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandmark">T</div><div><b>TRACEORA</b><small>QUALITY INTELLIGENCE</small></div></div>
      <nav className="navlist" aria-label="Main navigation">
        {NAV.map(({ id, label, Icon }) => <button key={id} type="button" className={`nav ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setError(''); setNotice(''); }}><Icon size={18}/><span>{label}</span></button>)}
      </nav>
      <div className="sidebottom"><ShieldCheck size={17}/> Evidence-first decision support</div>
    </aside>

    <main className="main">
      <header><div><span className="eyebrow">PHARMACEUTICAL QUALITY SYSTEM</span><h1>{page === 'command' ? 'Investigation Command Center' : title}</h1><p>Turn incident information into structured, evidence-aware investigations.</p></div><div className="status"><span/> SYSTEM ONLINE</div></header>
      {error && <div className="error globalmessage">{error}</div>}
      {notice && <div className="notice globalmessage">{notice}</div>}

      {page === 'command' && <>
        <section className="stats"><div className="stat"><small>WORKFLOW</small><b>Deviation → RCA → CAPA</b><span>Structured investigation</span></div><div className="stat"><small>AI GOVERNANCE</small><b>Human review required</b><span>AI outputs are suggestions</span></div><div className="stat"><small>SAVED INVESTIGATIONS</small><b>{history.length}</b><span>Stored in PostgreSQL</span></div></section>
        <section className="panel welcome"><span className="eyebrow">TRACEORA WORKSPACE</span><h2>Evidence-led quality investigations</h2><p>Upload an incident report, generate AI-assisted analysis using LangGraph + Groq, edit the findings, and save the reviewed version.</p><button className="primary compact" onClick={() => setPage('new')}><Plus size={17}/> Start new investigation</button></section>
        <section className="panel"><div className="paneltitle"><div><span className="eyebrow">RECENT RECORDS</span><h2>Investigation history</h2></div><button className="iconbutton" onClick={loadHistory} title="Refresh"><RefreshCw size={17}/></button></div><HistoryList items={history} onOpen={openInvestigation}/></section>
      </>}

      {page === 'new' && <section className="panel intakepanel"><div className="paneltitle"><div><span className="eyebrow">STEP 01</span><h2>Incident intake</h2></div><FileUp/></div><p className="muted">Paste a deviation description or upload a PDF/TXT/MD/CSV report. PDF text is extracted before analysis.</p>
        <form onSubmit={analyze}><label>INCIDENT DESCRIPTION</label><textarea value={text} onChange={e => setText(e.target.value)} placeholder="Example: Batch API-2026-014 failed moisture testing after the drying process. The report noted temperature variation in Dryer D-04..." rows="9"/>
          <label className="upload"><FileUp size={18}/><span>{file ? file.name : 'Choose PDF, TXT, MD or CSV'}</span><input type="file" accept=".pdf,.txt,.md,.csv" onChange={e => setFile(e.target.files?.[0] || null)}/></label>
          <button className="primary" disabled={busy}>{busy ? 'Analyzing with LangGraph…' : <><Search size={17}/> Analyze incident</>}</button>
        </form>
      </section>}

      {page === 'evidence' && <section className="panel resultpanel">
        <div className="paneltitle"><div><span className="eyebrow">STEP 02 · EDITABLE OUTPUT</span><h2>Evidence & root cause analysis</h2></div><GitBranch/></div>
        {!result ? <EmptyState text="No investigation selected yet. Create a new investigation or open one from history." onClick={() => setPage('new')}/> : <>
          <div className="resultmeta"><CheckCircle2 size={16}/> Investigation #{result.investigation_id} <span>{result.mode || 'Saved analysis'}</span></div>
          <h3>Incident summary</h3><textarea className="editarea" value={result.incident_summary || ''} onChange={e => updateResult(['incident_summary'], e.target.value)} rows="4"/>
          <h3>Extracted fields</h3><div className="fields">{Object.entries(result.extracted_fields || {}).map(([key, value]) => <div key={key}><small>{key.replaceAll('_', ' ')}</small><b>{value || 'Not identified'}</b></div>)}</div>
          <h3>Potential root causes · edit below</h3>
          {causes.map((cause, i) => <div className="cause" key={i}><label>ROOT CAUSE HYPOTHESIS</label><input className="editinput" value={cause.cause || ''} onChange={e => updateResult(['potential_root_causes', i, 'cause'], e.target.value)}/><label>STATUS</label><input className="editinput" value={cause.status || ''} onChange={e => updateResult(['potential_root_causes', i, 'status'], e.target.value)}/><label>SUPPORTING EVIDENCE (one item per line)</label><textarea className="editarea" rows="3" value={(cause.supporting_evidence || []).join('\n')} onChange={e => updateResult(['potential_root_causes', i, 'supporting_evidence'], e.target.value.split('\n').filter(Boolean))}/><label>MISSING EVIDENCE (one item per line)</label><textarea className="editarea" rows="3" value={(cause.missing_evidence || []).join('\n')} onChange={e => updateResult(['potential_root_causes', i, 'missing_evidence'], e.target.value.split('\n').filter(Boolean))}/></div>)}
          <h3>Evidence gaps · editable</h3><textarea className="editarea" rows="5" value={(result.missing_evidence || []).join('\n')} onChange={e => updateResult(['missing_evidence'], e.target.value.split('\n').filter(Boolean))}/>
          <div className="warning"><AlertTriangle size={18}/><span>AI-generated hypotheses are not confirmed root causes. Qualified personnel must verify evidence, risk and CAPA before any quality decision.</span></div>
          <button className="primary" onClick={saveReview} disabled={saving}><Save size={17}/>{saving ? 'Saving edits…' : 'Save edited investigation'}</button>
          <button className="secondary" onClick={() => setPage('capa')}>Continue to CAPA Studio</button>
        </>}
      </section>}

      {page === 'capa' && <section className="panel resultpanel"><div className="paneltitle"><div><span className="eyebrow">STEP 03 · EDITABLE OUTPUT</span><h2>CAPA Studio</h2></div><ClipboardCheck/></div>
        {!result ? <EmptyState text="Analyze or open an investigation before editing CAPA recommendations." onClick={() => setPage('new')}/> : <>
          <p className="muted">Edit the AI suggestions below. Save your changes to persist them with this investigation.</p>
          {capa.map((item, i) => <div className="capa" key={i}><label>ACTION TYPE</label><input className="editinput" value={item.type || ''} onChange={e => updateResult(['capa_recommendations', i, 'type'], e.target.value)}/><label>RECOMMENDED ACTION</label><textarea className="editarea" rows="3" value={item.action || ''} onChange={e => updateResult(['capa_recommendations', i, 'action'], e.target.value)}/><label>VERIFICATION</label><textarea className="editarea" rows="2" value={item.verification || ''} onChange={e => updateResult(['capa_recommendations', i, 'verification'], e.target.value)}/></div>)}
          <button className="primary" onClick={saveReview} disabled={saving}><Save size={17}/>{saving ? 'Saving…' : 'Save CAPA changes'}</button>
          <div className="warning"><AlertTriangle size={18}/><span>CAPA proposals are decision support only. Site procedures and qualified quality approval govern implementation.</span></div>
        </>}
      </section>}

      {page === 'history' && <section className="panel"><div className="paneltitle"><div><span className="eyebrow">POSTGRESQL RECORDS</span><h2>Investigation History</h2></div><button className="iconbutton" onClick={loadHistory}><RefreshCw size={17}/></button></div><HistoryList items={history} onOpen={openInvestigation}/></section>}
      <footer>TRACEORA AI · Prototype for evaluation · Not validated for GMP production use</footer>
    </main>
  </div>;
}

function HistoryList({ items, onOpen }) {
  if (!items.length) return <div className="empty smallempty"><p>No saved investigations yet.</p></div>;
  return <div className="historylist">{items.map(item => <button className="historyitem" key={item.id} onClick={() => onOpen(item.id)}><span><b>#{item.id} · {item.title || 'Quality investigation'}</b><small>{new Date(item.created_at).toLocaleString()} · {item.status}</small></span><ArrowLeft className="openarrow" size={17}/></button>)}</div>;
}
function EmptyState({ text, onClick }) { return <div className="empty"><div className="emptyicon"><Search size={28}/></div><p>{text}</p><button className="secondary" onClick={onClick}>Create investigation</button></div>; }
