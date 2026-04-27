import { useEffect, useState } from 'react'
import { reqs, parts } from '../api.js'

function StatusBadge({ status }) {
  const map = { submitted:'badge-blue', due_in:'badge-green', backordered:'badge-amber', shipped:'badge-blue', received:'badge-green', cancelled:'badge-dim' }
  return <span className={`badge ${map[status]||'badge-dim'}`}>{status}</span>
}

function SubmitModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ nsn:'', quantity:1, priority:'03', fund_code:'KB', jcn:'', mcn:'', aircraft_id:'' })
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const res = await reqs.submit({
        ...form,
        quantity:    parseInt(form.quantity),
        aircraft_id: form.aircraft_id ? parseInt(form.aircraft_id) : undefined,
      })
      setResult(res.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (result) return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">✅ Requisition Submitted</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="success-banner">Document: <strong className="mono">{result.requisition?.document_number}</strong></div>
          <div>
            <div className="section-title mb-2">A0A MILSTRIP Line</div>
            <pre className="milstrip-pre">{result.milstrip}</pre>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={() => { onSuccess?.(); onClose() }}>Done</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">New Requisition (A0A)</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="form-grid">
              <div className="form-group full">
                <label>NSN *</label>
                <input value={form.nsn} onChange={e=>set('nsn',e.target.value)} placeholder="e.g. 2840001248246" required />
              </div>
              <div className="form-group">
                <label>Quantity *</label>
                <input type="number" min="1" value={form.quantity} onChange={e=>set('quantity',e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Priority *</label>
                <select value={form.priority} onChange={e=>set('priority',e.target.value)}>
                  <option value="01">01 — NMCS</option>
                  <option value="02">02 — PMCS</option>
                  <option value="03">03 — Routine</option>
                  <option value="04">04 — Routine</option>
                </select>
              </div>
              <div className="form-group">
                <label>Fund Code</label>
                <input value={form.fund_code} disabled style={{color:'var(--text-dim)'}} />
              </div>
              <div className="form-group">
                <label>JCN</label>
                <input value={form.jcn} onChange={e=>set('jcn',e.target.value)} placeholder="Job Control Number" />
              </div>
              <div className="form-group">
                <label>MCN</label>
                <input value={form.mcn} onChange={e=>set('mcn',e.target.value)} placeholder="Material Control Number" />
              </div>
              <div className="form-group full">
                <label>Aircraft ID</label>
                <input type="number" value={form.aircraft_id} onChange={e=>set('aircraft_id',e.target.value)} placeholder="Aircraft ID (optional)" />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Submitting…' : 'Submit A0A'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── MOV Review Overlay ───────────────────────────────────────────────────────
function MovOverlay({ onClose }) {
  const [candidates, setCandidates] = useState([])
  const [selected,   setSelected]   = useState(new Set())
  const [loading,    setLoading]    = useState(true)
  const [acting,     setActing]     = useState(false)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState(null)

  useEffect(() => {
    reqs.mov()
      .then(r => setCandidates(r.data?.requisitions || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function toggleAll() {
    if (selected.size === candidates.length) setSelected(new Set())
    else setSelected(new Set(candidates.map(r => r.req_id)))
  }

  function toggle(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function bulk(action) {
    const ids = selected.size ? [...selected] : candidates.map(r => r.req_id)
    if (!ids.length) return
    setActing(true); setError(null)
    try {
      const res = await reqs.movBulk({ action, req_ids: ids })
      setResult(res.data)
      if (action === 'cancel') setCandidates(c => c.filter(r => !ids.includes(r.req_id)))
      if (action === 'validate') {
        setCandidates(c => c.map(r => ids.includes(r.req_id) ? {...r, mov_validated_at: new Date().toISOString()} : r))
      }
      setSelected(new Set())
    } catch(e) { setError(e.message) } finally { setActing(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div style={{
        background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)',
        width:'min(900px,95vw)', maxHeight:'85vh', display:'flex', flexDirection:'column',
        overflow:'hidden'
      }} onClick={e=>e.stopPropagation()}>

        <div className="modal-header">
          <div>
            <span className="modal-title">MOV Review — Material Obligation Validation</span>
            <div className="text-dim" style={{fontSize:11,marginTop:2}}>
              Pri 01/02 &gt; 5 days · Pri 03/04 &gt; 30 days · Validate (still needed) or Cancel (AC1)
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {error  && <div className="error-banner" style={{margin:'8px 16px'}}>{error}</div>}
        {result && <div className="success-banner" style={{margin:'8px 16px'}}>{result.message}{result.milstrips?.length ? ` — ${result.milstrips.length} AC1(s) generated` : ''}</div>}

        <div style={{flex:1,overflowY:'auto'}}>
          {loading ? <div className="loading">Loading…</div>
          : !candidates.length ? (
            <div className="empty"><span className="empty-icon">✅</span><div className="empty-text">No reqs require MOV action</div></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th><input type="checkbox" checked={selected.size===candidates.length&&candidates.length>0} onChange={toggleAll} /></th>
                  <th>Doc Number</th><th>NSN</th><th>Description</th>
                  <th>Pri</th><th>Status</th><th>Age</th><th>MOV Due</th><th>Validated</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(r => (
                  <tr key={r.req_id} style={{background: r.mov_due && !r.mov_validated_at ? 'rgba(239,68,68,0.04)' : undefined}}>
                    <td><input type="checkbox" checked={selected.has(r.req_id)} onChange={()=>toggle(r.req_id)} /></td>
                    <td className="td-mono">{r.document_number}</td>
                    <td className="td-mono">{r.nsn}</td>
                    <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.description}</td>
                    <td><span className={`pri pri-${r.priority}`}>{r.priority}</span></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className={Number(r.age_days)>30?'text-red fw-600':'td-primary'}>{r.age_days}d</td>
                    <td>{r.mov_due ? <span className="badge badge-red">DUE</span> : <span className="text-dim">—</span>}</td>
                    <td className="text-dim" style={{fontSize:11}}>
                      {r.mov_validated_at ? new Date(r.mov_validated_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-footer" style={{borderTop:'1px solid var(--border)',padding:'12px 20px'}}>
          <span className="text-dim" style={{fontSize:12,flex:1}}>
            {selected.size > 0 ? `${selected.size} selected` : `${candidates.length} candidates — select rows or use buttons below to act on all`}
          </span>
          <button className="btn btn-secondary" onClick={()=>bulk('validate')} disabled={acting||!candidates.length}>
            {acting?'…':'✓ Validate'} {selected.size?`(${selected.size})`:'All'}
          </button>
          <button className="btn btn-secondary" style={{color:'var(--red)'}} onClick={()=>bulk('cancel')} disabled={acting||!candidates.length}>
            {acting?'…':'✕ Cancel'} {selected.size?`(${selected.size})`:'All'} — AC1
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default function Requisitions() {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showMov, setShowMov] = useState(false)
  const [filter,  setFilter]  = useState({ status: '', priority: '' })
  const [action,  setAction]  = useState({}) // { id, type, loading, result, error }

  async function load() {
    setLoading(true)
    try {
      const params = {}
      if (filter.status)   params.status   = filter.status
      if (filter.priority) params.priority = filter.priority
      if (!filter.status)  params.open     = true
      const res = await reqs.list(params)
      setData(res.data.requisitions || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filter])

  async function doFollowup(id) {
    setAction({ id, type:'followup', loading:true })
    try {
      const res = await reqs.followup(id)
      setAction({ id, type:'followup', result: res.data.milstrip })
    } catch (err) { setAction({ id, type:'followup', error: err.message }) }
  }

  async function doCancel(id) {
    if (!confirm('Cancel this requisition? An AC1 will be generated.')) return
    setAction({ id, type:'cancel', loading:true })
    try {
      const res = await reqs.cancel(id)
      setAction({ id, type:'cancel', result: res.data.milstrip })
      load()
    } catch (err) { setAction({ id, type:'cancel', error: err.message }) }
  }

  return (
    <>
      {showNew && <SubmitModal onClose={() => setShowNew(false)} onSuccess={load} />}
      {showMov && <MovOverlay onClose={() => setShowMov(false)} />}

      {/* MILSTRIP result overlay */}
      {action.result && (
        <div className="modal-backdrop" onClick={() => setAction({})}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">MILSTRIP Generated</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setAction({})}>✕</button>
            </div>
            <div className="modal-body">
              <pre className="milstrip-pre">{action.result}</pre>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setAction({})}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 justify-between">
        <div className="filters">
          <select value={filter.status} onChange={e => setFilter(f=>({...f,status:e.target.value}))}>
            <option value="">All Open</option>
            <option value="submitted">Submitted</option>
            <option value="due_in">Due-In</option>
            <option value="backordered">Backordered</option>
            <option value="shipped">Shipped</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={filter.priority} onChange={e => setFilter(f=>({...f,priority:e.target.value}))}>
            <option value="">All Priorities</option>
            <option value="01">01 — NMCS</option>
            <option value="02">02 — PMCS</option>
            <option value="03">03 — Routine</option>
          </select>
        </div>
        <button className="btn btn-secondary" onClick={() => setShowMov(true)}>MOV Review</button>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Req</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-card">
        <div className="table-card-header">
          <span className="table-card-title">Requisitions</span>
          <span className="text-dim" style={{fontSize:12}}>{data.length} document{data.length!==1?'s':''}</span>
        </div>
        <div className="table-wrap">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : !data.length ? (
            <div className="empty"><span className="empty-icon">📋</span><div className="empty-text">No requisitions found</div></div>
          ) : (
            <table>
              <thead>
                <tr><th>Doc Number</th><th>NSN</th><th>Description</th><th>Qty</th><th>Pri</th><th>Status</th><th>BUNO</th><th>Fund</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <tr key={r.req_id}>
                    <td className="td-mono">{r.document_number}</td>
                    <td className="td-mono">{r.nsn}</td>
                    <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={r.description}>{r.description}</td>
                    <td>{r.quantity}</td>
                    <td><span className={`pri pri-${r.priority}`}>{r.priority}</span></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="td-mono">{r.buno||'—'}</td>
                    <td className="td-mono">{r.fund_code||'—'}</td>
                    <td>
                      <div className="flex gap-2">
                        {r.status !== 'received' && r.status !== 'cancelled' && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => doFollowup(r.req_id)}
                              disabled={action.id===r.req_id && action.loading} title="Generate AP1 follow-up">AP1</button>
                            <button className="btn btn-danger btn-sm" onClick={() => doCancel(r.req_id)}
                              disabled={action.id===r.req_id && action.loading} title="Cancel — generate AC1">AC1</button>
                          </>
                        )}
                        <a className="btn btn-secondary btn-sm"
                          href={reqs.milstripUrl(r.req_id)} target="_blank" rel="noreferrer">↓</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <a className="btn btn-secondary" href={reqs.dd2765Url()} target="_blank" rel="noreferrer">↓ Download DD-2765</a>
      </div>
    </>
  )
}
