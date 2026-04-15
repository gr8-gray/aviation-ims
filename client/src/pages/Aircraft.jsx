import { useEffect, useState } from 'react'
import { aircraft as acApi } from '../api.js'

function StatusBadge({ status }) {
  const map = { active:'badge-green', grounded:'badge-red', deployed:'badge-blue' }
  return <span className={`badge ${map[status]||'badge-dim'}`}>{status}</span>
}

function OpenNmcsModal({ onClose }) {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    acApi.nmcsOpen().then(r => setData(r.data.nmcs_events||[])).finally(() => setLoading(false))
  }, [])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:760}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">All Open NMCS / PMCS Events</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{padding:0}}>
          {loading ? <div className="loading">Loading…</div> : !data.length ? (
            <div className="empty"><span className="empty-icon">✅</span><div className="empty-text">No open events</div></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Type</th><th>BUNO</th><th>MDS</th><th>Part</th><th>JCN</th><th>Days</th><th>Req</th></tr></thead>
                <tbody>
                  {data.map(e => (
                    <tr key={e.event_id}>
                      <td><span className={`badge ${e.type==='NMCS'?'badge-red':'badge-amber'}`}>{e.type}</span></td>
                      <td className="td-mono td-primary">{e.buno}</td>
                      <td>{e.mds}</td>
                      <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.part_description}</td>
                      <td className="td-mono">{e.jcn||'—'}</td>
                      <td className={Number(e.days_open)>10?'text-red fw-600':''}>{Math.round(e.days_open)}d</td>
                      <td>{e.document_number ? <span className="mono">{e.document_number}</span> : <span className="text-dim">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function OpenNmcsForm({ aircraftId, onClose, onSuccess }) {
  const [form, setForm] = useState({ nsn:'', jcn:'', type:'NMCS' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      await acApi.openNmcs(aircraftId, form)
      onSuccess?.()
      onClose()
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Open NMCS / PMCS Event</span>
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
                <label>Type</label>
                <select value={form.type} onChange={e=>set('type',e.target.value)}>
                  <option value="NMCS">NMCS — Grounded</option>
                  <option value="PMCS">PMCS — Partial</option>
                </select>
              </div>
              <div className="form-group">
                <label>JCN</label>
                <input value={form.jcn} onChange={e=>set('jcn',e.target.value)} placeholder="Job Control Number" />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={loading}>{loading?'Opening…':'Open Event'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Aircraft() {
  const [data,     setData]    = useState([])
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState(null)
  const [showAll,  setShowAll] = useState(false)
  const [nmcsForm, setNmcsForm]= useState(null) // aircraftId
  const [detail,   setDetail]  = useState(null) // aircraft object

  async function load() {
    setLoading(true)
    try {
      const res = await acApi.list()
      setData(res.data.aircraft || [])
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function loadDetail(id) {
    try {
      const res = await acApi.get(id)
      setDetail(res.data)
    } catch(err) { alert(err.message) }
  }

  async function closeNmcs(aircraftId, eventId) {
    if (!confirm('Close this NMCS event?')) return
    try {
      await acApi.closeNmcs(aircraftId, eventId)
      if (detail) loadDetail(aircraftId)
      load()
    } catch(err) { alert(err.message) }
  }

  return (
    <>
      {showAll  && <OpenNmcsModal onClose={() => setShowAll(false)} />}
      {nmcsForm && <OpenNmcsForm aircraftId={nmcsForm} onClose={() => setNmcsForm(null)} onSuccess={load} />}

      {/* Detail drawer */}
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" style={{maxWidth:680}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">BUNO {detail.aircraft?.buno} — {detail.aircraft?.mds}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="section-title">Open NMCS Events ({detail.nmcs_open?.length || 0})</div>
              {!detail.nmcs_open?.length ? <p className="text-dim mt-1">No open events</p> : (
                <table style={{marginTop:8}}>
                  <thead><tr><th>Type</th><th>NSN</th><th>JCN</th><th>Opened</th><th></th></tr></thead>
                  <tbody>
                    {detail.nmcs_open.map(e => (
                      <tr key={e.event_id}>
                        <td><span className={`badge ${e.type==='NMCS'?'badge-red':'badge-amber'}`}>{e.type}</span></td>
                        <td className="td-mono">{e.nsn}</td>
                        <td className="td-mono">{e.jcn||'—'}</td>
                        <td className="text-dim">{new Date(e.opened_at).toLocaleDateString()}</td>
                        <td><button className="btn btn-secondary btn-sm" onClick={() => closeNmcs(detail.aircraft.aircraft_id, e.event_id)}>Close</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="section-title mt-2">Open Requisitions ({detail.reqs_open?.length || 0})</div>
              {!detail.reqs_open?.length ? <p className="text-dim mt-1">No open reqs</p> : (
                <table style={{marginTop:8}}>
                  <thead><tr><th>Doc Number</th><th>NSN</th><th>Pri</th><th>Status</th></tr></thead>
                  <tbody>
                    {detail.reqs_open.map(r => (
                      <tr key={r.req_id}>
                        <td className="td-mono">{r.document_number}</td>
                        <td className="td-mono">{r.nsn}</td>
                        <td><span className={`pri pri-${r.priority}`}>{r.priority}</span></td>
                        <td><span className="badge badge-blue">{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger btn-sm" onClick={() => { setNmcsForm(detail.aircraft.aircraft_id); setDetail(null) }}>+ Open NMCS</button>
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 justify-between">
        <span className="text-muted">{data.length} aircraft in unit</span>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => setShowAll(true)}>View All NMCS</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-card">
        <div className="table-card-header">
          <span className="table-card-title">Aircraft</span>
        </div>
        <div className="table-wrap">
          {loading ? <div className="loading">Loading…</div> : !data.length ? (
            <div className="empty"><span className="empty-icon">✈️</span><div className="empty-text">No aircraft in unit</div></div>
          ) : (
            <table>
              <thead>
                <tr><th>BUNO</th><th>MDS</th><th>Status</th><th>NMCS</th><th>Open Reqs</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {data.map(ac => (
                  <tr key={ac.aircraft_id}>
                    <td className="td-mono td-primary">{ac.buno}</td>
                    <td>{ac.mds}</td>
                    <td><StatusBadge status={ac.status} /></td>
                    <td>
                      {Number(ac.open_nmcs_count) > 0
                        ? <span className="badge badge-red">{ac.open_nmcs_count} open</span>
                        : <span className="text-dim">—</span>}
                    </td>
                    <td>
                      {Number(ac.open_req_count) > 0
                        ? <span className="badge badge-amber">{ac.open_req_count}</span>
                        : <span className="text-dim">—</span>}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={() => loadDetail(ac.aircraft_id)}>Detail</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setNmcsForm(ac.aircraft_id)}>+ NMCS</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
