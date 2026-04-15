import { useEffect, useState } from 'react'
import { inventory } from '../api.js'

function IssueModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ nsn:'', quantity:1, condition:'RFI', jcn:'', mcn:'', notes:'' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      await inventory.issue({ ...form, quantity: parseInt(form.quantity) })
      onSuccess?.(); onClose()
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Issue Parts</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="form-grid">
              <div className="form-group full"><label>NSN *</label><input value={form.nsn} onChange={e=>set('nsn',e.target.value)} placeholder="13-digit NSN" required /></div>
              <div className="form-group"><label>Quantity *</label><input type="number" min="1" value={form.quantity} onChange={e=>set('quantity',e.target.value)} required /></div>
              <div className="form-group"><label>Condition</label><select value={form.condition} onChange={e=>set('condition',e.target.value)}><option value="RFI">RFI</option><option value="NRFI">NRFI</option></select></div>
              <div className="form-group"><label>JCN</label><input value={form.jcn} onChange={e=>set('jcn',e.target.value)} placeholder="Job Control Number" /></div>
              <div className="form-group"><label>MCN</label><input value={form.mcn} onChange={e=>set('mcn',e.target.value)} placeholder="Material Control Number" /></div>
              <div className="form-group full"><label>Notes</label><input value={form.notes} onChange={e=>set('notes',e.target.value)} /></div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading?'Issuing…':'Issue'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AdjustModal({ item, onClose, onSuccess }) {
  const [newQty,  setNewQty]  = useState(item?.qty_on_hand || 0)
  const [reason,  setReason]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      await inventory.adjust({ nsn: item.nsn, condition: item.condition, new_qty: parseInt(newQty), reason })
      onSuccess?.(); onClose()
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Inventory Adjustment</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="text-muted mb-2" style={{fontSize:12}}>
              <span className="mono">{item?.nsn}</span> — {item?.description} · Current: <strong>{item?.qty_on_hand}</strong> {item?.condition}
            </div>
            <div className="form-grid">
              <div className="form-group"><label>New Qty *</label><input type="number" min="0" value={newQty} onChange={e=>setNewQty(e.target.value)} required /></div>
              <div className="form-group"><label>Condition</label><input value={item?.condition} disabled /></div>
              <div className="form-group full"><label>Reason (audit trail) *</label><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Physical count — found 2 additional units in bin B-3" required /></div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading?'Saving…':'Save Adjustment'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Inventory() {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [showIssue, setShowIssue] = useState(false)
  const [adjustItem, setAdjustItem] = useState(null)
  const [filterLow, setFilterLow] = useState(false)
  const [search,  setSearch]  = useState('')

  async function load() {
    setLoading(true)
    try {
      const params = {}
      if (filterLow) params.low = true
      if (search)    params.nsn = search.trim()
      const res = await inventory.list(params)
      setData(res.data.inventory || [])
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filterLow])

  const lowCount = data.filter(i => i.qty_on_hand <= i.reorder_point).length

  return (
    <>
      {showIssue  && <IssueModal  onClose={() => setShowIssue(false)} onSuccess={load} />}
      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSuccess={load} />}

      <div className="flex items-center gap-3 justify-between">
        <div className="filters">
          <input value={search} onChange={e=>setSearch(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&load()}
            placeholder="Filter by NSN…" />
          <button className="btn btn-secondary" onClick={load}>Search</button>
          <button className={`btn ${filterLow ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterLow(v=>!v)}>
            {filterLow ? '⚠ Low Stock Only' : 'Show Low Stock'}
            {!filterLow && lowCount > 0 && <span className="nav-badge">{lowCount}</span>}
          </button>
        </div>
        <button className="btn btn-primary" onClick={() => setShowIssue(true)}>Issue Parts</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-card">
        <div className="table-card-header">
          <span className="table-card-title">Stock Status</span>
          <span className="text-dim" style={{fontSize:12}}>{data.length} item{data.length!==1?'s':''} · {lowCount} low stock</span>
        </div>
        <div className="table-wrap">
          {loading ? <div className="loading">Loading…</div> : !data.length ? (
            <div className="empty"><span className="empty-icon">📦</span><div className="empty-text">No inventory records found</div></div>
          ) : (
            <table>
              <thead><tr><th>NSN</th><th>Description</th><th>Cond</th><th>On Hand</th><th>Due-In</th><th>On Order</th><th>Reorder</th><th>UI</th><th>Price</th><th></th></tr></thead>
              <tbody>
                {data.map(item => (
                  <tr key={`${item.nsn}-${item.condition}`}>
                    <td className="td-mono td-primary">{item.nsn}</td>
                    <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.description}</td>
                    <td><span className={`badge ${item.condition==='RFI'?'badge-green':'badge-amber'}`}>{item.condition}</span></td>
                    <td className={item.qty_on_hand <= item.reorder_point ? 'text-red fw-600' : 'td-primary'}>{item.qty_on_hand}</td>
                    <td>{item.qty_due_in||0}</td>
                    <td>{item.qty_on_order||0}</td>
                    <td className="text-dim">{item.reorder_point}</td>
                    <td>{item.unit_of_issue||'—'}</td>
                    <td>{item.unit_price ? `$${Number(item.unit_price).toFixed(2)}` : '—'}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setAdjustItem(item)} title="Adjust qty">✏</button></td>
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
