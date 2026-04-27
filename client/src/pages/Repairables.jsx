import { useEffect, useState } from 'react'
import { repairables, inventory } from '../api.js'

const SHOP_LABELS = {
  i_level:    { label: 'I-Level',    color: 'badge-blue'  },
  depot:      { label: 'Depot',      color: 'badge-amber' },
  commercial: { label: 'Commercial', color: 'badge-dim'   },
}

const CONDITION_COLORS = {
  RFI:        'badge-green',
  NRFI:       'badge-red',
  in_repair:  'badge-amber',
  condemned:  'badge-dim',
}

const LOCATION_LABELS = {
  storage:   'Storage',
  installed: 'Installed',
  i_level:   'I-Level',
  depot:     'Depot',
  vendor:    'Vendor',
  drmo:      'DRMO',
}

// ── Add Serialized Item Modal ────────────────────────────────────────────────
function AddItemModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ nsn:'', serial_number:'', condition:'RFI', location:'storage', jcn:'', notes:'' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      await repairables.addSerialized(form)
      onSuccess?.(); onClose()
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Register Serialized Item</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner mb-2">{error}</div>}
            <div className="form-grid">
              <div className="form-group"><label>NSN *</label><input value={form.nsn} onChange={e=>set('nsn',e.target.value)} placeholder="13-digit NSN" required /></div>
              <div className="form-group"><label>Serial Number *</label><input value={form.serial_number} onChange={e=>set('serial_number',e.target.value)} placeholder="Component S/N" required /></div>
              <div className="form-group"><label>Condition</label>
                <select value={form.condition} onChange={e=>set('condition',e.target.value)}>
                  <option value="RFI">RFI</option>
                  <option value="NRFI">NRFI</option>
                </select>
              </div>
              <div className="form-group"><label>Location</label>
                <select value={form.location} onChange={e=>set('location',e.target.value)}>
                  {Object.entries(LOCATION_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group"><label>JCN</label><input value={form.jcn} onChange={e=>set('jcn',e.target.value)} placeholder="If installed/removed" /></div>
              <div className="form-group"><label>Notes</label><input value={form.notes} onChange={e=>set('notes',e.target.value)} /></div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading?'Saving…':'Register'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Send to Maintenance Modal ────────────────────────────────────────────────
const ROUTE_LABELS = {
  i_level:    { label: 'I-Level Repair',    color: '#3d8bc9' },
  commercial: { label: 'Commercial Repair', color: 'var(--amber)' },
  ots:        { label: 'OTS',               color: 'var(--green)' },
}

function SendToShopModal({ item, onClose, onSuccess }) {
  const [pnInput,  setPnInput]  = useState(item?.nsn || '')
  const [routing,  setRouting]  = useState(null)
  const [looking,  setLooking]  = useState(false)
  const [form, setForm] = useState({
    nsn:             item?.nsn || '',
    serial_number:   item?.serial_number || '',
    item_id:         item?.item_id || '',
    quantity:        1,
    shop:            item ? (item.shop || 'i_level') : 'i_level',
    shop_name:       '',
    document_number: '',
    jcn:             item?.jcn || '',
    expected_return: '',
    notes:           '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function lookupRouting(pn) {
    if (!pn.trim()) return
    setLooking(true)
    try {
      const res = await repairables.routing(pn.trim())
      const r = res.data
      setRouting(r)
      setForm(f => ({
        ...f,
        nsn:      pn.trim().toUpperCase(),
        shop:     r.shop || 'i_level',
        shop_name: r.shop_name || '',
      }))
    } catch { setRouting(null) } finally { setLooking(false) }
  }

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      await repairables.sendToShop({
        ...form,
        item_id:  form.item_id  || null,
        quantity: parseInt(form.quantity),
        expected_return: form.expected_return || null,
      })
      onSuccess?.(); onClose()
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Send to Maintenance (DIFM)</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner mb-2">{error}</div>}

            {/* P/N lookup with auto-routing */}
            <div className="form-group full" style={{marginBottom:8}}>
              <label>P/N or NSN *</label>
              <div className="flex gap-2">
                <input style={{flex:1}} value={pnInput}
                  onChange={e=>setPnInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),lookupRouting(pnInput))}
                  placeholder="Enter P/N or NSN to auto-route" />
                <button type="button" className="btn btn-secondary"
                  onClick={()=>lookupRouting(pnInput)} disabled={looking}>
                  {looking ? '…' : 'Route'}
                </button>
              </div>
            </div>

            {/* Routing result banner */}
            {routing && (
              <div style={{
                padding:'8px 12px', borderRadius:'var(--radius)', marginBottom:12,
                background:'rgba(0,0,0,0.2)', border:'1px solid var(--border)',
                fontSize:12, display:'flex', alignItems:'center', gap:8
              }}>
                <span style={{fontWeight:700, color: ROUTE_LABELS[routing.type]?.color || 'var(--text)'}}>
                  {ROUTE_LABELS[routing.type]?.label || routing.type}
                </span>
                <span className="text-dim">— {routing.reason}</span>
              </div>
            )}

            <div className="form-grid">
              <div className="form-group"><label>Serial Number</label><input value={form.serial_number} onChange={e=>set('serial_number',e.target.value)} placeholder="If serialized" /></div>
              <div className="form-group"><label>Quantity</label><input type="number" min="1" value={form.quantity} onChange={e=>set('quantity',e.target.value)} /></div>
              <div className="form-group"><label>Shop Type *</label>
                <select value={form.shop} onChange={e=>set('shop',e.target.value)} required>
                  <option value="i_level">I-Level</option>
                  <option value="depot">Depot / OTS</option>
                  <option value="commercial">Commercial</option>
                </select>
              </div>
              <div className="form-group"><label>Shop / Vendor Name</label>
                <input value={form.shop_name} onChange={e=>set('shop_name',e.target.value)}
                  placeholder={form.shop==='commercial'?'Vendor name':'e.g. MALS-39, NADEP'} />
              </div>
              <div className="form-group"><label>Document Number</label><input value={form.document_number} onChange={e=>set('document_number',e.target.value)} /></div>
              <div className="form-group"><label>JCN</label><input value={form.jcn} onChange={e=>set('jcn',e.target.value)} /></div>
              <div className="form-group"><label>Expected Return</label><input type="date" value={form.expected_return} onChange={e=>set('expected_return',e.target.value)} /></div>
              <div className="form-group full"><label>Notes</label><input value={form.notes} onChange={e=>set('notes',e.target.value)} /></div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading||!form.nsn}>{loading?'Sending…':'Open DIFM'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Receive Back Modal ───────────────────────────────────────────────────────
function ReceiveBackModal({ difmItem, onClose, onSuccess }) {
  const [conditionIn, setConditionIn] = useState('RFI')
  const [notes,       setNotes]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      await repairables.receiveBack(difmItem.difm_id, { condition_in: conditionIn, notes: notes || null })
      onSuccess?.(); onClose()
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Receive Back from Maintenance</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner mb-2">{error}</div>}
            <div className="text-muted mb-2" style={{fontSize:12}}>
              <span className="mono">{difmItem?.nsn}</span>
              {difmItem?.serial_number && <> S/N <span className="mono">{difmItem.serial_number}</span></>}
              &nbsp;— {difmItem?.description}
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>Condition Received *</label>
                <select value={conditionIn} onChange={e=>setConditionIn(e.target.value)}>
                  <option value="RFI">RFI — Ready for Issue</option>
                  <option value="NRFI">NRFI — Still Not RFI</option>
                </select>
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Work performed, condition notes…" />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading?'Saving…':'Receive'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Upload Lists Panel ───────────────────────────────────────────────────────
function ListsPanel() {
  const [icrlFile,   setIcrlFile]   = useState(null)
  const [crlFile,    setCrlFile]    = useState(null)
  const [icrlResult, setIcrlResult] = useState(null)
  const [crlResult,  setCrlResult]  = useState(null)
  const [icrlLoading,setIcrlLoading]= useState(false)
  const [crlLoading, setCrlLoading] = useState(false)
  const [icrlError,  setIcrlError]  = useState(null)
  const [crlError,   setCrlError]   = useState(null)

  async function uploadIcrl() {
    if (!icrlFile) return
    setIcrlLoading(true); setIcrlError(null); setIcrlResult(null)
    try {
      const res = await repairables.icrlUpload(icrlFile)
      setIcrlResult(res.data.message)
    } catch(err) { setIcrlError(err.message) } finally { setIcrlLoading(false) }
  }

  async function uploadCrl() {
    if (!crlFile) return
    setCrlLoading(true); setCrlError(null); setCrlResult(null)
    try {
      const res = await repairables.crlUpload(crlFile)
      setCrlResult(res.data.message)
    } catch(err) { setCrlError(err.message) } finally { setCrlLoading(false) }
  }

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

      {/* ICRL Upload */}
      <div className="table-card">
        <div className="table-card-header">
          <span className="table-card-title">ICRL — Individual Component Repair List</span>
        </div>
        <div style={{padding:'16px 20px'}}>
          <div className="text-dim" style={{fontSize:12,marginBottom:12}}>
            Upload quarterly ICRL from I-Level shop. Replaces all existing entries.<br/>
            Expected columns: <span className="mono">P/N · NSN · Description · Work Center · Capability Code</span>
          </div>
          {icrlError  && <div className="error-banner mb-2">{icrlError}</div>}
          {icrlResult && <div className="success-banner mb-2">{icrlResult}</div>}
          <div className="flex gap-2 items-center">
            <input type="file" accept=".xlsx,.xls"
              onChange={e=>setIcrlFile(e.target.files[0]||null)}
              style={{flex:1,fontSize:12}} />
            <button className="btn btn-primary" onClick={uploadIcrl}
              disabled={!icrlFile||icrlLoading}>
              {icrlLoading ? 'Uploading…' : 'Upload & Replace'}
            </button>
          </div>
          {icrlFile && <div className="text-dim" style={{fontSize:11,marginTop:6}}>{icrlFile.name}</div>}
        </div>
      </div>

      {/* Commercial Repair List Upload */}
      <div className="table-card">
        <div className="table-card-header">
          <span className="table-card-title">Commercial Repair List</span>
        </div>
        <div style={{padding:'16px 20px'}}>
          <div className="text-dim" style={{fontSize:12,marginBottom:12}}>
            Parts that go to a specific commercial vendor regardless of ICRL designation. Replaces all existing entries.<br/>
            Expected columns: <span className="mono">P/N · NSN · Description · Vendor</span>
          </div>
          {crlError  && <div className="error-banner mb-2">{crlError}</div>}
          {crlResult && <div className="success-banner mb-2">{crlResult}</div>}
          <div className="flex gap-2 items-center">
            <input type="file" accept=".xlsx,.xls"
              onChange={e=>setCrlFile(e.target.files[0]||null)}
              style={{flex:1,fontSize:12}} />
            <button className="btn btn-primary" onClick={uploadCrl}
              disabled={!crlFile||crlLoading}>
              {crlLoading ? 'Uploading…' : 'Upload & Replace'}
            </button>
          </div>
          {crlFile && <div className="text-dim" style={{fontSize:11,marginTop:6}}>{crlFile.name}</div>}
        </div>
      </div>

      {/* Routing logic reference */}
      <div className="table-card" style={{gridColumn:'1/-1'}}>
        <div className="table-card-header"><span className="table-card-title">Routing Decision Logic</span></div>
        <div style={{padding:'14px 20px'}}>
          <table>
            <thead><tr><th>ICRL Result</th><th>Commercial Repair List</th><th>Routing Decision</th></tr></thead>
            <tbody>
              <tr><td>Not X1 (repairable)</td><td>—</td><td><span className="badge badge-blue">I-Level → Work Center</span></td></tr>
              <tr><td>X1 (not repairable)</td><td>On list</td><td><span className="badge badge-amber">Commercial → Vendor</span></td></tr>
              <tr><td>X1 (not repairable)</td><td>Not on list</td><td><span className="badge badge-green">OTS</span></td></tr>
              <tr><td>Not in ICRL</td><td>—</td><td><span className="badge badge-green">OTS (default)</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Repairables() {
  const [tab,        setTab]        = useState('difm')
  const [items,      setItems]      = useState([])
  const [difmData,   setDifmData]   = useState({ items:[], open:0, overdue:0, avg_days:0 })
  const [loading,    setLoading]    = useState(true)
  const [showAdd,    setShowAdd]    = useState(false)
  const [sendItem,   setSendItem]   = useState(null)
  const [receiveItem,setReceiveItem]= useState(null)
  const [showAll,    setShowAll]    = useState(false)

  async function loadItems() {
    setLoading(true)
    try {
      const res = await repairables.serialized()
      setItems(res.data?.items || [])
    } catch(e) { console.error(e) } finally { setLoading(false) }
  }

  async function loadDifm() {
    setLoading(true)
    try {
      const res = await repairables.difm({ all: showAll ? 'true' : undefined })
      setDifmData(res.data || { items:[], open:0, overdue:0, avg_days:0 })
    } catch(e) { console.error(e) } finally { setLoading(false) }
  }

  const [drmoItems, setDrmoItems] = useState([])

  async function loadDrmo() {
    setLoading(true)
    try {
      const res = await inventory.drmo()
      setDrmoItems(res.data?.items || [])
    } catch(e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => {
    if (tab === 'difm') loadDifm()
    else if (tab === 'serialized') loadItems()
    else if (tab === 'drmo') loadDrmo()
  }, [tab, showAll])

  return (
    <>
      {showAdd    && <AddItemModal     onClose={()=>setShowAdd(false)}    onSuccess={loadItems} />}
      {sendItem   && <SendToShopModal  item={sendItem}   onClose={()=>setSendItem(null)}    onSuccess={()=>{loadItems();loadDifm()}} />}
      {receiveItem&& <ReceiveBackModal difmItem={receiveItem} onClose={()=>setReceiveItem(null)} onSuccess={loadDifm} />}

      {/* Tab bar + toolbar */}
      <div className="flex items-center gap-3 justify-between" style={{marginBottom:12}}>
        <div className="filters">
          <button className={`btn ${tab==='difm'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('difm')}>
            DIFM Queue {difmData.overdue > 0 && <span className="nav-badge">{difmData.overdue}</span>}
          </button>
          <button className={`btn ${tab==='serialized'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('serialized')}>
            Serialized Items
          </button>
          <button className={`btn ${tab==='lists'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('lists')}>
            ICRL / Repair Lists
          </button>
          <button className={`btn ${tab==='drmo'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('drmo')}>
            DRMO Queue
          </button>
          {tab === 'difm' && (
            <button className={`btn ${showAll?'btn-primary':'btn-secondary'}`} onClick={()=>setShowAll(v=>!v)}>
              {showAll ? 'All Records' : 'Open Only'}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {tab === 'serialized' && (
            <button className="btn btn-secondary" onClick={()=>setSendItem({})}>Send to Maintenance</button>
          )}
          {tab === 'serialized' && (
            <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ Register Item</button>
          )}
          {tab === 'difm' && (
            <button className="btn btn-primary" onClick={()=>setSendItem({})}>+ Open DIFM</button>
          )}
          {tab === 'lists' && (
            <button className="btn btn-secondary" onClick={()=>setSendItem({})}>+ Open DIFM</button>
          )}
        </div>
      </div>

      {/* ── DIFM Tab ── */}
      {tab === 'difm' && (
        <div className="table-card">
          {/* Summary bar */}
          <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',display:'flex',gap:16,flexWrap:'wrap'}}>
            <div className="stat-pill">
              <span className="stat-num" style={{color:difmData.open>0?'var(--amber)':'var(--text)'}}>{difmData.open}</span>
              <span className="text-dim">In Repair</span>
            </div>
            <div className="stat-pill">
              <span className="stat-num" style={{color:difmData.overdue>0?'var(--red)':'var(--text)'}}>{difmData.overdue}</span>
              <span className="text-dim">Overdue</span>
            </div>
            <div className="stat-pill">
              <span className="stat-num">{difmData.avg_days}d</span>
              <span className="text-dim">Avg Days Out</span>
            </div>
          </div>

          <div className="table-wrap">
            {loading ? <div className="loading">Loading…</div>
            : !difmData.items.length ? (
              <div className="empty"><span className="empty-icon">✅</span><div className="empty-text">No DIFM items {showAll ? '' : 'currently in maintenance'}</div></div>
            ) : (
              <table>
                <thead>
                  <tr><th>NSN</th><th>S/N</th><th>Description</th><th>Shop</th><th>Shop Name</th><th>JCN</th><th>Days Out</th><th>Exp Return</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {difmData.items.map(d => {
                    const shopMeta = SHOP_LABELS[d.shop] || { label: d.shop, color: 'badge-dim' }
                    return (
                      <tr key={d.difm_id} style={{background: d.overdue ? 'rgba(239,68,68,0.04)' : undefined}}>
                        <td className="td-mono td-primary">{d.nsn}</td>
                        <td className="td-mono">{d.serial_number || '—'}</td>
                        <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.description||'—'}</td>
                        <td><span className={`badge ${shopMeta.color}`}>{shopMeta.label}</span></td>
                        <td className="text-dim" style={{fontSize:12}}>{d.shop_name||'—'}</td>
                        <td className="td-mono">{d.jcn||'—'}</td>
                        <td className={d.overdue?'text-red fw-600':'td-primary'}>{d.days_out}d</td>
                        <td className="text-dim" style={{fontSize:12}}>
                          {d.expected_return ? new Date(d.expected_return).toLocaleDateString() : '—'}
                        </td>
                        <td>
                          {d.status === 'in_repair'
                            ? <span className="badge badge-amber">In Repair</span>
                            : d.status === 'returned'
                            ? <span className="badge badge-green">Returned</span>
                            : <span className="badge badge-dim">{d.status}</span>}
                        </td>
                        <td>
                          {d.status === 'in_repair' && (
                            <button className="btn btn-ghost btn-sm" onClick={()=>setReceiveItem(d)}>Receive</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Serialized Items Tab ── */}
      {tab === 'serialized' && (
        <div className="table-card">
          <div className="table-card-header">
            <span className="table-card-title">Tracked Serialized Components</span>
            <span className="text-dim" style={{fontSize:12}}>{items.length} registered</span>
          </div>
          <div className="table-wrap">
            {loading ? <div className="loading">Loading…</div>
            : !items.length ? (
              <div className="empty"><span className="empty-icon">🔧</span><div className="empty-text">No serialized items registered — click Register Item to add</div></div>
            ) : (
              <table>
                <thead>
                  <tr><th>NSN</th><th>S/N</th><th>Description</th><th>Condition</th><th>Location</th><th>BUNO</th><th>JCN</th><th>Updated</th><th></th></tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.item_id}>
                      <td className="td-mono td-primary">{item.nsn}</td>
                      <td className="td-mono">{item.serial_number}</td>
                      <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.description||'—'}</td>
                      <td><span className={`badge ${CONDITION_COLORS[item.condition]||'badge-dim'}`}>{item.condition}</span></td>
                      <td>{LOCATION_LABELS[item.location]||item.location}</td>
                      <td className="td-mono">{item.buno||'—'}</td>
                      <td className="td-mono">{item.jcn||'—'}</td>
                      <td className="text-dim" style={{fontSize:12}}>{new Date(item.updated_at).toLocaleDateString()}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm"
                          onClick={()=>setSendItem(item)}
                          title="Send to maintenance">→ Shop</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {/* ── Lists Tab ── */}
      {tab === 'lists' && <ListsPanel />}

      {/* ── DRMO Queue Tab ── */}
      {tab === 'drmo' && (
        <div className="table-card">
          <div className="table-card-header">
            <span className="table-card-title">DRMO Queue — Condemned / Unserviceable Items</span>
            <span className="text-dim" style={{fontSize:12}}>{drmoItems.length} item{drmoItems.length!==1?'s':''} · routed to Defense Reutilization &amp; Marketing Office</span>
          </div>
          <div className="table-wrap">
            {loading ? <div className="loading">Loading…</div>
            : !drmoItems.length ? (
              <div className="empty"><span className="empty-icon">♻️</span><div className="empty-text">No DRMO turns recorded</div></div>
            ) : (
              <table>
                <thead>
                  <tr><th>Date</th><th>NSN</th><th>Description</th><th>Qty</th><th>Condition</th><th>JCN</th></tr>
                </thead>
                <tbody>
                  {drmoItems.map(item => (
                    <tr key={item.transaction_id}>
                      <td className="text-dim" style={{fontSize:12,whiteSpace:'nowrap'}}>{new Date(item.created_at).toLocaleDateString()}</td>
                      <td className="td-mono td-primary">{item.nsn}</td>
                      <td style={{maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.description||'—'}</td>
                      <td className="td-primary fw-600">{item.quantity}</td>
                      <td><span className="badge badge-dim">{item.condition_in||item.condition_out||'NRFI'}</span></td>
                      <td className="td-mono">{item.jcn||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  )
}
