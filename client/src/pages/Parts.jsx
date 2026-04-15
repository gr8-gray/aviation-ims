import { useState } from 'react'
import { parts } from '../api.js'

function FlisResult({ result, onSelect }) {
  return (
    <div style={{ border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:12, cursor:'pointer', background:'var(--bg-card)' }}
         onClick={() => onSelect(result)}>
      <div className="flex items-center gap-2">
        <span className="td-mono td-primary">{result.nsn}</span>
        <span className="badge badge-blue">FLIS</span>
      </div>
      <div className="text-muted mt-1" style={{fontSize:12}}>{result.itemName}</div>
      <div className="text-dim" style={{fontSize:11}}>FSC {result.fsc} · NIIN {result.niin}</div>
    </div>
  )
}

function AddPartModal({ prefill, onClose, onSuccess }) {
  const [form, setForm] = useState({
    nsn: prefill?.nsn?.replace(/-/g,'') || '',
    niin: prefill?.niin || '',
    fsc: prefill?.fsc || '',
    part_number: '',
    cage_code: '',
    description: prefill?.itemName || '',
    unit_of_issue: '',
    unit_price: '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      await parts.add(form)
      onSuccess?.()
      onClose()
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add Part to Catalog</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div style={{fontSize:12,color:'var(--text-dim)',marginBottom:4}}>
              Provide P/N + CAGE and system will auto-query FLIS, or enter NSN directly.
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>Part Number *</label>
                <input value={form.part_number} onChange={e=>set('part_number',e.target.value)} placeholder="e.g. MS21919WCF10" required />
              </div>
              <div className="form-group">
                <label>CAGE Code</label>
                <input value={form.cage_code} onChange={e=>set('cage_code',e.target.value)} placeholder="e.g. 96906" maxLength={5} />
              </div>
              <div className="form-group">
                <label>NSN (if known)</label>
                <input value={form.nsn} onChange={e=>set('nsn',e.target.value)} placeholder="13-digit, no dashes" maxLength={16} />
              </div>
              <div className="form-group">
                <label>Unit of Issue</label>
                <input value={form.unit_of_issue} onChange={e=>set('unit_of_issue',e.target.value)} placeholder="EA, PK, LT…" maxLength={2} />
              </div>
              <div className="form-group full">
                <label>Description (optional — FLIS will populate)</label>
                <input value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Item name / noun name" />
              </div>
              <div className="form-group">
                <label>Unit Price</label>
                <input type="number" step="0.01" value={form.unit_price} onChange={e=>set('unit_price',e.target.value)} placeholder="0.00" />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading?'Adding…':'Add Part'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Parts() {
  const [query,    setQuery]   = useState('')
  const [results,  setResults] = useState([])
  const [flis,     setFlis]    = useState([])
  const [loading,  setLoading] = useState(false)
  const [flisLoad, setFlisLoad]= useState(false)
  const [error,    setError]   = useState(null)
  const [showAdd,  setShowAdd] = useState(false)
  const [prefill,  setPrefill] = useState(null)
  const [pending,  setPending] = useState([])
  const [showPending, setShowPending] = useState(false)

  async function search() {
    if (!query.trim()) return
    setLoading(true); setError(null); setFlis([])
    try {
      const res = await parts.list({ q: query })
      setResults(res.data.parts || [])
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  async function flisSearch() {
    if (!query.trim()) return
    setFlisLoad(true); setError(null)
    try {
      const res = await parts.flisLookup(query)
      setFlis(res.data.results || [])
    } catch(err) { setError(err.message) } finally { setFlisLoad(false) }
  }

  async function loadPending() {
    try {
      const res = await parts.list({ pending: true })
      setPending(res.data.parts || [])
      setShowPending(true)
    } catch(err) { setError(err.message) }
  }

  async function approve(nsn) {
    try {
      await parts.approve(nsn, {})
      setPending(p => p.filter(x => x.nsn !== nsn))
    } catch(err) { alert(err.message) }
  }

  return (
    <>
      {showAdd && <AddPartModal prefill={prefill} onClose={() => { setShowAdd(false); setPrefill(null) }} onSuccess={search} />}

      <div className="flex items-center gap-3 justify-between">
        <div className="filters">
          <input value={query} onChange={e=>setQuery(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&search()}
            placeholder="Search NSN, NIIN, description…" style={{minWidth:260}} />
          <button className="btn btn-primary" onClick={search} disabled={loading}>Search DB</button>
          <button className="btn btn-secondary" onClick={flisSearch} disabled={flisLoad}>FLIS Lookup</button>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={loadPending}>Pending Approval</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Part</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* FLIS results */}
      {flis.length > 0 && (
        <div className="table-card">
          <div className="table-card-header">
            <span className="table-card-title">FLIS Results — click to add</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setFlis([])}>Clear</button>
          </div>
          <div style={{padding:'12px 20px',display:'flex',flexDirection:'column',gap:8}}>
            {flis.map((r,i) => (
              <FlisResult key={i} result={r} onSelect={r => { setPrefill(r); setShowAdd(true) }} />
            ))}
          </div>
        </div>
      )}

      {/* Pending approval */}
      {showPending && (
        <div className="table-card">
          <div className="table-card-header">
            <span className="table-card-title">Pending Approval ({pending.length})</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPending(false)}>Hide</button>
          </div>
          <div className="table-wrap">
            {!pending.length ? <div className="empty"><div className="empty-text">No parts pending approval</div></div> : (
              <table>
                <thead><tr><th>NSN</th><th>NIIN</th><th>Description</th><th>UI</th><th>P/Ns</th><th></th></tr></thead>
                <tbody>
                  {pending.map(p => (
                    <tr key={p.nsn}>
                      <td className="td-mono">{p.nsn}</td>
                      <td className="td-mono">{p.niin}</td>
                      <td>{p.description||'—'}</td>
                      <td>{p.unit_of_issue||'—'}</td>
                      <td className="text-dim" style={{fontSize:12}}>{p.part_numbers?.map(x=>x.part_number).join(', ')||'—'}</td>
                      <td><button className="btn btn-primary btn-sm" onClick={() => approve(p.nsn)}>Approve</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* DB results */}
      <div className="table-card">
        <div className="table-card-header">
          <span className="table-card-title">Parts Catalog</span>
          <span className="text-dim" style={{fontSize:12}}>{results.length} result{results.length!==1?'s':''}</span>
        </div>
        <div className="table-wrap">
          {loading ? <div className="loading">Searching…</div> : !results.length ? (
            <div className="empty"><span className="empty-icon">🔩</span><div className="empty-text">Search the catalog or use FLIS Lookup</div></div>
          ) : (
            <table>
              <thead><tr><th>NSN</th><th>NIIN</th><th>Description</th><th>UI</th><th>Price</th><th>Verified</th><th>Part Numbers</th></tr></thead>
              <tbody>
                {results.map(p => (
                  <tr key={p.nsn}>
                    <td className="td-mono td-primary">{p.nsn}</td>
                    <td className="td-mono">{p.niin}</td>
                    <td style={{maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.description||'—'}</td>
                    <td>{p.unit_of_issue||'—'}</td>
                    <td>{p.unit_price ? `$${Number(p.unit_price).toFixed(2)}` : '—'}</td>
                    <td>{p.flis_verified ? <span className="badge badge-green">Verified</span> : <span className="badge badge-amber">Pending</span>}</td>
                    <td className="text-dim" style={{fontSize:12}}>{p.part_numbers?.map(x=>x.part_number).join(', ')||'—'}</td>
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
