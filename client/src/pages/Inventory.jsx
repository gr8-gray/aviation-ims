import { useEffect, useState } from 'react'
import { inventory, parts, users } from '../api.js'

// ── Issue Modal ──────────────────────────────────────────────────────────────
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

// ── Turn-In Modal ────────────────────────────────────────────────────────────
function TurnInModal({ item, onClose, onSuccess }) {
  const [form, setForm] = useState({
    nsn:       item?.nsn || '',
    quantity:  1,
    condition: item?.condition || 'NRFI',
    jcn:       item?.jcn || '',
    notes:     '',
  })
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [disposition, setDisposition] = useState(null)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      const res = await inventory.turnIn({ ...form, quantity: parseInt(form.quantity) })
      setDisposition(res.data)
      onSuccess?.()
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  const DISP_COLORS = { stock:'var(--green)', i_level:'var(--blue, #3d8bc9)', commercial:'var(--amber)', drmo:'var(--text-dim)' }

  return (
    <div className="modal-backdrop" onClick={!disposition ? onClose : undefined}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Turn In Parts</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        {disposition ? (
          <div className="modal-body">
            <div className="success-banner mb-2">Turn-in recorded</div>
            <div style={{padding:'10px 0',fontSize:13}}>
              <span style={{fontWeight:600,color: DISP_COLORS[disposition.disposition] || 'var(--text)'}}>
                Disposition: {disposition.disposition?.toUpperCase().replace('_',' ')}
              </span>
              <div className="text-dim" style={{marginTop:4,fontSize:12}}>{disposition.message}</div>
            </div>
            <div className="modal-footer" style={{paddingTop:12}}>
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="error-banner mb-2">{error}</div>}
              {item && <div className="text-muted mb-2" style={{fontSize:12}}><span className="mono">{item.nsn}</span> — {item.description}</div>}
              <div className="form-grid">
                {!item && <div className="form-group full"><label>NSN *</label><input value={form.nsn} onChange={e=>set('nsn',e.target.value)} required /></div>}
                <div className="form-group"><label>Quantity *</label><input type="number" min="1" value={form.quantity} onChange={e=>set('quantity',e.target.value)} required /></div>
                <div className="form-group"><label>Condition</label>
                  <select value={form.condition} onChange={e=>set('condition',e.target.value)}>
                    <option value="RFI">RFI</option>
                    <option value="NRFI">NRFI</option>
                  </select>
                </div>
                <div className="form-group"><label>JCN</label><input value={form.jcn} onChange={e=>set('jcn',e.target.value)} /></div>
                <div className="form-group full"><label>Notes</label><input value={form.notes} onChange={e=>set('notes',e.target.value)} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading?'Processing…':'Turn In'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Repairable Exchange Modal ─────────────────────────────────────────────────
function ExchangeModal({ item, onClose, onSuccess }) {
  const [form, setForm] = useState({
    nsn:      item?.nsn || '',
    quantity: 1,
    jcn:      item?.jcn || '',
    mcn:      '',
    vendor:   '',
    notes:    '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [result,  setResult]  = useState(null)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      const res = await inventory.exchange({ ...form, quantity: parseInt(form.quantity) })
      setResult(res.data)
      onSuccess?.()
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={!result ? onClose : undefined}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Repairable Exchange</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        {result ? (
          <div className="modal-body">
            <div className="success-banner mb-2">{result.message}</div>
            <div style={{fontSize:12,marginBottom:8}}>
              <span className="text-dim">Repair source: </span>
              <strong>{result.repair_source || '—'}</strong>
              {result.capability_code && <span className="text-dim"> ({result.capability_code})</span>}
            </div>
            {result.dd1149 && (
              <>
                <div className="section-title" style={{marginBottom:6}}>DD-1149 Generated</div>
                <pre className="milstrip-pre">{result.dd1149}</pre>
              </>
            )}
            <div className="modal-footer" style={{paddingTop:12}}>
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="error-banner mb-2">{error}</div>}
              {item && <div className="text-muted mb-2" style={{fontSize:12}}><span className="mono">{item.nsn}</span> — {item.description} · RFI On Hand: <strong>{item.qty_on_hand}</strong></div>}
              <div className="text-dim mb-2" style={{fontSize:11}}>Issues RFI unit, receives NRFI carcass. Generates DD-1149 if X1.</div>
              <div className="form-grid">
                {!item && <div className="form-group full"><label>NSN *</label><input value={form.nsn} onChange={e=>set('nsn',e.target.value)} required /></div>}
                <div className="form-group"><label>Quantity *</label><input type="number" min="1" value={form.quantity} onChange={e=>set('quantity',e.target.value)} required /></div>
                <div className="form-group"><label>JCN</label><input value={form.jcn} onChange={e=>set('jcn',e.target.value)} /></div>
                <div className="form-group"><label>MCN</label><input value={form.mcn} onChange={e=>set('mcn',e.target.value)} /></div>
                <div className="form-group full"><label>Vendor (if X1 commercial)</label><input value={form.vendor} onChange={e=>set('vendor',e.target.value)} placeholder="Leave blank to auto-detect from ICRL" /></div>
                <div className="form-group full"><label>Notes</label><input value={form.notes} onChange={e=>set('notes',e.target.value)} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading?'Processing…':'Exchange'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Adjust Modal ─────────────────────────────────────────────────────────────
function AdjustModal({ item, onClose, onSuccess }) {
  const [newQty,  setNewQty]  = useState(item?.qty_on_hand || 0)
  const [reason,  setReason]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const delta = parseInt(newQty || 0) - (item?.qty_on_hand || 0)

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
          <span className="modal-title">Physical Count Adjustment</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="text-muted mb-2" style={{fontSize:12}}>
              <span className="mono">{item?.nsn}</span> — {item?.description}
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>Current Count</label>
                <input value={item?.qty_on_hand} disabled />
              </div>
              <div className="form-group">
                <label>New Physical Count *</label>
                <input type="number" min="0" value={newQty} onChange={e=>setNewQty(e.target.value)} required autoFocus />
              </div>
              <div className="form-group">
                <label>Condition</label>
                <input value={item?.condition} disabled />
              </div>
              <div className="form-group">
                <label>Net Change</label>
                <input value={delta === 0 ? '0 (no change)' : delta > 0 ? `+${delta}` : `${delta}`} disabled
                  style={{color: delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text-dim)', fontWeight: 600}} />
              </div>
              <div className="form-group full">
                <label>Reason (required for audit trail) *</label>
                <input value={reason} onChange={e=>setReason(e.target.value)}
                  placeholder="e.g. Physical count — found 2 additional units in bin B-3" required />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || delta === 0 || !reason}>
              {loading ? 'Saving…' : 'Save Count'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Transfer Modal ───────────────────────────────────────────────────────────
function TransferModal({ item, onClose, onSuccess }) {
  const [unitList, setUnitList] = useState([])
  const [form, setForm] = useState({ to_unit_id: '', quantity: 1, condition: item?.condition || 'RFI', notes: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [result,  setResult]  = useState(null)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  useEffect(() => {
    users.units().then(r => setUnitList(r.data?.units || [])).catch(()=>{})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      const res = await inventory.transfer({
        nsn:        item.nsn,
        quantity:   parseInt(form.quantity),
        condition:  form.condition,
        to_unit_id: parseInt(form.to_unit_id),
        notes:      form.notes || null,
      })
      setResult(res.data)
      onSuccess?.()
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={!result ? onClose : undefined}>
      <div className="modal" style={{maxWidth:560}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Inter-Site Transfer</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {result ? (
          <div className="modal-body">
            <div className="success-banner mb-2">{result.message}</div>
            {result.dd1149 && (
              <>
                <div className="section-title" style={{marginBottom:8}}>DD-1149 Generated</div>
                <pre className="milstrip-pre">{result.dd1149}</pre>
              </>
            )}
            <div className="modal-footer" style={{paddingTop:12}}>
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="error-banner mb-2">{error}</div>}
              <div className="text-muted mb-2" style={{fontSize:12}}>
                <span className="mono">{item?.nsn}</span> — {item?.description}
                &nbsp;·&nbsp;On Hand: <strong>{item?.qty_on_hand}</strong> {item?.condition}
              </div>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Destination Unit *</label>
                  <select value={form.to_unit_id} onChange={e=>set('to_unit_id',e.target.value)} required>
                    <option value="">Select unit…</option>
                    {unitList.map(u => (
                      <option key={u.unit_id} value={u.unit_id}>{u.name} — {u.uic}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity *</label>
                  <input type="number" min="1" max={item?.qty_on_hand} value={form.quantity}
                    onChange={e=>set('quantity',e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Condition</label>
                  <select value={form.condition} onChange={e=>set('condition',e.target.value)}>
                    <option value="RFI">RFI</option>
                    <option value="NRFI">NRFI</option>
                  </select>
                </div>
                <div className="form-group full">
                  <label>Notes</label>
                  <input value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Optional transfer notes" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading || !form.to_unit_id}>
                {loading ? 'Transferring…' : 'Transfer + Generate DD-1149'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Part Detail Drawer ───────────────────────────────────────────────────────
const TX_LABELS = {
  issue:               { label: 'Issue',           color: 'badge-red'   },
  receipt:             { label: 'Receipt',          color: 'badge-green' },
  turn_in:             { label: 'Turn-In',          color: 'badge-blue'  },
  adjustment:          { label: 'Adjustment',       color: 'badge-amber' },
  transfer:            { label: 'Transfer',         color: 'badge-dim'   },
  repairable_exchange: { label: 'Repairable Exch',  color: 'badge-amber' },
}

function PartDetailDrawer({ item, onClose, onAdjust, onTransfer, onTurnIn, onExchange }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!item) return
    setLoading(true)
    inventory.partHistory(item.nsn)
      .then(r => setHistory(r.data?.transactions || []))
      .catch(()=>{})
      .finally(() => setLoading(false))
  }, [item?.nsn])

  if (!item) return null

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:200,display:'flex',justifyContent:'flex-end'}}
      onClick={onClose}>
      <div style={{width:'min(720px,95vw)',height:'100vh',background:'var(--bg-card)',borderLeft:'1px solid var(--border)',display:'flex',flexDirection:'column',overflowY:'auto'}}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,position:'sticky',top:0,background:'var(--bg-card)',zIndex:1}}>
          <div style={{flex:1}}>
            <div className="td-mono td-primary" style={{fontSize:15,fontWeight:700}}>{item.nsn}</div>
            <div style={{fontSize:12,color:'var(--text-dim)',marginTop:2}}>{item.description}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={e=>{e.stopPropagation();onTurnIn(item)}}>Turn In</button>
          <button className="btn btn-secondary btn-sm" onClick={e=>{e.stopPropagation();onExchange(item)}}>Exchange</button>
          <button className="btn btn-secondary btn-sm" onClick={e=>{e.stopPropagation();onTransfer(item)}}>Transfer</button>
          <button className="btn btn-secondary btn-sm" onClick={e=>{e.stopPropagation();onAdjust(item)}}>Adjust Count</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Part metadata */}
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
          {[
            ['Unit of Issue',  item.unit_of_issue || '—'],
            ['Unit Price',     item.unit_price ? `$${Number(item.unit_price).toFixed(2)}` : '—'],
            ['Bin Location',   item.bin_location || '—'],
            ['FLIS Verified',  item.flis_verified ? '✓ Yes' : '⚠ Local'],
          ].map(([lbl, val]) => (
            <div key={lbl}>
              <div style={{fontSize:11,color:'var(--text-dim)',marginBottom:3}}>{lbl}</div>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{val}</div>
            </div>
          ))}
        </div>

        {/* Stock summary */}
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',gap:12,flexWrap:'wrap'}}>
          <div className="stat-pill">
            <span className="stat-num" style={{color:item.qty_on_hand<=item.reorder_point?'var(--red)':'var(--text)'}}>
              {item.qty_on_hand}
            </span>
            <span className="text-dim">On Hand ({item.condition})</span>
          </div>
          <div className="stat-pill"><span className="stat-num">{item.qty_due_in||0}</span><span className="text-dim">Due-In</span></div>
          <div className="stat-pill"><span className="stat-num">{item.qty_on_order||0}</span><span className="text-dim">On Order</span></div>
          <div className="stat-pill"><span className="stat-num text-dim">{item.reorder_point}</span><span className="text-dim">Reorder Pt</span></div>
        </div>

        {/* Transaction history */}
        <div style={{flex:1,padding:'16px 20px'}}>
          <div className="section-title" style={{marginBottom:12}}>
            Transaction History {!loading && history.length > 0 && <span className="text-dim" style={{fontWeight:400,fontSize:11}}>({history.length})</span>}
          </div>
          {loading ? (
            <div className="loading">Loading history…</div>
          ) : !history.length ? (
            <div className="empty"><div className="empty-text">No transactions recorded for this NSN</div></div>
          ) : (
            <table>
              <thead>
                <tr><th>Type</th><th>Date</th><th>Qty</th><th>JCN</th><th>BUNO</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {history.map(tx => {
                  const meta = TX_LABELS[tx.type] || { label: tx.type, color: 'badge-dim' }
                  return (
                    <tr key={tx.transaction_id}>
                      <td><span className={`badge ${meta.color}`}>{meta.label}</span></td>
                      <td className="text-dim" style={{fontSize:12,whiteSpace:'nowrap'}}>{new Date(tx.created_at).toLocaleDateString()}</td>
                      <td className="td-primary fw-600">{tx.quantity}</td>
                      <td className="td-mono">{tx.jcn||'—'}</td>
                      <td className="td-mono">{tx.buno||'—'}</td>
                      <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12,color:'var(--text-dim)'}}>{tx.notes||'—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function Inventory() {
  const [data,          setData]          = useState([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)
  const [showIssue,     setShowIssue]     = useState(false)
  const [adjustItem,    setAdjustItem]    = useState(null)
  const [transferItem,  setTransferItem]  = useState(null)
  const [turnInItem,    setTurnInItem]    = useState(null)
  const [exchangeItem,  setExchangeItem]  = useState(null)
  const [detailItem,    setDetailItem]    = useState(null)
  const [filterLow,     setFilterLow]     = useState(false)
  const [search,        setSearch]        = useState('')

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

  function handleRowClick(item) {
    setDetailItem(item)
  }

  function openAdjust(item)   { setDetailItem(null); setAdjustItem(item)   }
  function openTransfer(item) { setDetailItem(null); setTransferItem(item) }
  function openTurnIn(item)   { setDetailItem(null); setTurnInItem(item)   }
  function openExchange(item) { setDetailItem(null); setExchangeItem(item) }

  return (
    <>
      {showIssue    && <IssueModal    onClose={() => setShowIssue(false)}    onSuccess={load} />}
      {adjustItem   && <AdjustModal   item={adjustItem}   onClose={() => setAdjustItem(null)}   onSuccess={load} />}
      {transferItem && <TransferModal item={transferItem} onClose={() => setTransferItem(null)} onSuccess={load} />}
      {turnInItem   && <TurnInModal   item={turnInItem}   onClose={() => setTurnInItem(null)}   onSuccess={load} />}
      {exchangeItem && <ExchangeModal item={exchangeItem} onClose={() => setExchangeItem(null)} onSuccess={load} />}
      {detailItem   && (
        <PartDetailDrawer
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onAdjust={openAdjust}
          onTransfer={openTransfer}
          onTurnIn={openTurnIn}
          onExchange={openExchange}
        />
      )}

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
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => setTurnInItem({})}   title="Turn in parts to stock or DRMO">Turn In</button>
          <button className="btn btn-secondary" onClick={() => setExchangeItem({})} title="Repairable exchange — RFI out, NRFI in">Exchange</button>
          <button className="btn btn-secondary" onClick={() => setTransferItem(data[0] || null)} disabled={!data.length}>Transfer</button>
          <button className="btn btn-primary"   onClick={() => setShowIssue(true)}>Issue Parts</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-card">
        <div className="table-card-header">
          <span className="table-card-title">Stock Status</span>
          <span className="text-dim" style={{fontSize:12}}>{data.length} item{data.length!==1?'s':''} · {lowCount} low stock · click row for detail</span>
        </div>
        <div className="table-wrap">
          {loading ? <div className="loading">Loading…</div> : !data.length ? (
            <div className="empty"><span className="empty-icon">📦</span><div className="empty-text">No inventory records found</div></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>NSN</th><th>Description</th><th>Cond</th><th>Location</th>
                  <th>On Hand</th><th>Due-In</th><th>On Order</th><th>Reorder</th>
                  <th>UI</th><th>Price</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={`${item.nsn}-${item.condition}`}
                    style={{cursor:'pointer'}}
                    onClick={() => handleRowClick(item)}>
                    <td className="td-mono td-primary">{item.nsn}</td>
                    <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.description}</td>
                    <td><span className={`badge ${item.condition==='RFI'?'badge-green':'badge-amber'}`}>{item.condition}</span></td>
                    <td className="td-mono" style={{fontSize:11}}>{item.bin_location||'—'}</td>
                    <td className={item.qty_on_hand <= item.reorder_point ? 'text-red fw-600' : 'td-primary'}>{item.qty_on_hand}</td>
                    <td>{item.qty_due_in||0}</td>
                    <td>{item.qty_on_order||0}</td>
                    <td className="text-dim">{item.reorder_point}</td>
                    <td>{item.unit_of_issue||'—'}</td>
                    <td>{item.unit_price ? `$${Number(item.unit_price).toFixed(2)}` : '—'}</td>
                    <td onClick={e=>e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openAdjust(item)} title="Adjust physical count">Adj</button>
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
