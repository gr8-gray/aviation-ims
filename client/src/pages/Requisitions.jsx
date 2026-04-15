import { useEffect, useState } from 'react'
import { reqs, parts } from '../api.js'

function StatusBadge({ status }) {
  const map = { submitted:'badge-blue', due_in:'badge-green', backordered:'badge-amber', shipped:'badge-blue', received:'badge-green', cancelled:'badge-dim' }
  return <span className={`badge ${map[status]||'badge-dim'}`}>{status}</span>
}

function SubmitModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ nsn:'', quantity:1, priority:'03', fund_code:'', jcn:'', mcn:'', aircraft_id:'' })
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
                <label>Fund Code *</label>
                <input value={form.fund_code} onChange={e=>set('fund_code',e.target.value)} placeholder="e.g. FB" maxLength={2} required />
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

export default function Requisitions() {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [showNew, setShowNew] = useState(false)
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
