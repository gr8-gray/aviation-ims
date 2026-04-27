import { useState } from 'react'
import { reports, reqs } from '../api.js'

const REPORT_LIST = [
  { key: 'nmcs',   label: 'NMCS Brief',           desc: 'All open NMCS/PMCS — daily Supply Officer brief' },
  { key: 'open',   label: 'Open Documents',        desc: 'Outstanding reqs with age and overdue flags' },
  { key: 'stock',  label: 'Stock Status',          desc: 'On-hand snapshot with low-stock indicators' },
  { key: 'usage',  label: 'Usage Trends',          desc: 'Top consumed parts by quantity issued' },
  { key: 'jcn',    label: 'Parts Cost by JCN',     desc: 'Total parts value per maintenance job' },
  { key: 'tat',    label: 'Turnaround Time (TAT)', desc: 'Req submission → receipt by priority and NSN' },
  { key: 'awop',  label: 'AWOP Status Board',     desc: 'Aircraft awaiting parts — causative NSN, document number, days down' },
]

function NmcsBrief({ data }) {
  if (!data?.events?.length) return <div className="empty"><span className="empty-icon">✅</span><div className="empty-text">No open NMCS events</div></div>
  return (
    <table>
      <thead><tr><th>Type</th><th>BUNO</th><th>MDS</th><th>Part</th><th>JCN</th><th>Days Down</th><th>Req</th></tr></thead>
      <tbody>
        {data.events.map(e => (
          <tr key={e.event_id}>
            <td><span className={`badge ${e.type==='NMCS'?'badge-red':'badge-amber'}`}>{e.type}</span></td>
            <td className="td-mono td-primary">{e.buno}</td>
            <td>{e.mds}</td>
            <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.part_description}</td>
            <td className="td-mono">{e.jcn||'—'}</td>
            <td className={Number(e.days_open)>10?'text-red fw-600':''}>{e.days_open}d</td>
            <td>{e.document_number ? <span className="mono">{e.document_number}</span> : <span className="text-dim">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function OpenDocs({ data }) {
  if (!data?.requisitions?.length) return <div className="empty"><span className="empty-icon">📋</span><div className="empty-text">No open documents</div></div>
  return (
    <table>
      <thead><tr><th>Doc Number</th><th>NSN</th><th>Description</th><th>Pri</th><th>Status</th><th>Age</th><th>Overdue</th></tr></thead>
      <tbody>
        {data.requisitions.map(r => (
          <tr key={r.req_id}>
            <td className="td-mono">{r.document_number}</td>
            <td className="td-mono">{r.nsn}</td>
            <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.description}</td>
            <td><span className={`pri pri-${r.priority}`}>{r.priority}</span></td>
            <td><span className="badge badge-blue">{r.status}</span></td>
            <td>{r.age_days}d</td>
            <td>{r.overdue ? <span className="badge badge-red">OVERDUE</span> : <span className="text-dim">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StockStatus({ data }) {
  if (!data?.stock?.length) return <div className="empty"><span className="empty-icon">📦</span><div className="empty-text">No stock records</div></div>
  return (
    <table>
      <thead><tr><th>NSN</th><th>Description</th><th>Cond</th><th>On Hand</th><th>Reorder</th><th>On Order</th><th>Status</th></tr></thead>
      <tbody>
        {data.stock.map((s,i) => (
          <tr key={i}>
            <td className="td-mono">{s.nsn}</td>
            <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.description}</td>
            <td><span className={`badge ${s.condition==='RFI'?'badge-green':'badge-amber'}`}>{s.condition}</span></td>
            <td className={s.low_stock?'text-red fw-600':'td-primary'}>{s.qty_on_hand}</td>
            <td className="text-dim">{s.reorder_point}</td>
            <td>{s.qty_on_order||0}</td>
            <td>{s.low_stock ? <span className="badge badge-red">LOW</span> : <span className="badge badge-green">OK</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function UsageTrends({ data }) {
  if (!data?.trends?.length) return <div className="empty"><div className="empty-text">No issue history in period</div></div>
  return (
    <table>
      <thead><tr><th>NSN</th><th>Description</th><th>UI</th><th>Total Issued</th><th>Events</th><th>Aircraft</th><th>Last Issued</th></tr></thead>
      <tbody>
        {data.trends.map((t,i) => (
          <tr key={i}>
            <td className="td-mono">{t.nsn}</td>
            <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.description}</td>
            <td>{t.unit_of_issue||'—'}</td>
            <td className="td-primary fw-600">{t.total_issued}</td>
            <td>{t.issue_events}</td>
            <td>{t.aircraft_count}</td>
            <td className="text-dim">{new Date(t.last_issued).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CostByJcn({ data }) {
  if (!data?.jcn_costs?.length) return <div className="empty"><div className="empty-text">No JCN data in period</div></div>
  return (
    <table>
      <thead><tr><th>JCN</th><th>BUNO</th><th>MDS</th><th>Part Types</th><th>Total Qty</th><th>Total Cost</th><th>Period</th></tr></thead>
      <tbody>
        {data.jcn_costs.map((j,i) => (
          <tr key={i}>
            <td className="td-mono td-primary">{j.jcn}</td>
            <td className="td-mono">{j.buno||'—'}</td>
            <td>{j.mds||'—'}</td>
            <td>{j.part_types}</td>
            <td>{j.total_qty}</td>
            <td className="td-primary">{j.total_cost ? `$${Number(j.total_cost).toFixed(2)}` : '—'}</td>
            <td className="text-dim">{new Date(j.first_issue).toLocaleDateString()} – {new Date(j.last_issue).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TatReport({ data }) {
  if (!data?.tat?.length) return <div className="empty"><div className="empty-text">No completed requisitions in period</div></div>
  return (
    <table>
      <thead><tr><th>Pri</th><th>NSN</th><th>Description</th><th>Orders</th><th>Avg Days</th><th>Min</th><th>Max</th></tr></thead>
      <tbody>
        {data.tat.map((t,i) => (
          <tr key={i}>
            <td><span className={`pri pri-${t.priority}`}>{t.priority}</span></td>
            <td className="td-mono">{t.nsn}</td>
            <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.description}</td>
            <td>{t.orders_received}</td>
            <td className="td-primary fw-600">{t.avg_days}d</td>
            <td className="text-dim">{Number(t.min_days).toFixed(0)}d</td>
            <td className="text-dim">{Number(t.max_days).toFixed(0)}d</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AwopBoard({ data }) {
  const [followupResults, setFollowupResults] = useState({})
  const [loading, setLoading] = useState({})

  async function expedite(e) {
    if (!e.req_id) return
    setLoading(l => ({...l, [e.event_id]: true}))
    try {
      const res = await reqs.followup(e.req_id)
      setFollowupResults(r => ({...r, [e.event_id]: res.data}))
    } catch(err) {
      setFollowupResults(r => ({...r, [e.event_id]: { error: err.message }}))
    } finally {
      setLoading(l => ({...l, [e.event_id]: false}))
    }
  }

  if (!data?.events?.length) return <div className="empty"><span className="empty-icon">✅</span><div className="empty-text">No aircraft awaiting parts</div></div>
  return (
    <>
      <div style={{display:'flex',gap:16,padding:'12px 20px',borderBottom:'1px solid var(--border)'}}>
        <div className="stat-pill"><span className="stat-num text-red">{data.aircraft_awop}</span><span className="text-dim">AWOP Aircraft</span></div>
        <div className="stat-pill"><span className="stat-num">{data.count}</span><span className="text-dim">Open Events</span></div>
        <div className="stat-pill"><span className="stat-num">{data.avg_days}d</span><span className="text-dim">Avg Days Down</span></div>
        {data.no_req > 0 && <div className="stat-pill"><span className="stat-num text-red">{data.no_req}</span><span className="text-dim">No Req Filed</span></div>}
      </div>
      <table>
        <thead><tr><th>BUNO</th><th>MDS</th><th>Part</th><th>NSN</th><th>JCN</th><th>Days Down</th><th>Doc Number</th><th>Pri</th><th>Req Status</th><th></th></tr></thead>
        <tbody>
          {data.events.map(e => (
            <>
              <tr key={e.event_id}>
                <td className="td-mono td-primary">{e.buno}</td>
                <td>{e.mds}</td>
                <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.part_description}</td>
                <td className="td-mono">{e.nsn}</td>
                <td className="td-mono">{e.jcn||'—'}</td>
                <td className={Number(e.days_down)>5?'text-red fw-600':'td-primary'}>{e.days_down}d</td>
                <td>{e.document_number ? <span className="td-mono">{e.document_number}</span> : <span className="badge badge-red">NO REQ</span>}</td>
                <td>{e.priority ? <span className={`pri pri-${e.priority}`}>{e.priority}</span> : <span className="text-dim">—</span>}</td>
                <td>{e.req_status ? <span className="badge badge-blue">{e.req_status}</span> : <span className="text-dim">—</span>}</td>
                <td>
                  {e.req_id && !followupResults[e.event_id] && (
                    <button className="btn btn-ghost btn-sm" onClick={()=>expedite(e)} disabled={loading[e.event_id]}>
                      {loading[e.event_id] ? '…' : 'Follow Up'}
                    </button>
                  )}
                  {followupResults[e.event_id]?.milstrip && <span className="badge badge-green">AP1 Sent</span>}
                  {followupResults[e.event_id]?.error && <span className="badge badge-red">Error</span>}
                </td>
              </tr>
              {followupResults[e.event_id]?.milstrip && (
                <tr key={`${e.event_id}-ap1`}>
                  <td colSpan={10} style={{padding:'4px 12px 8px',background:'var(--bg)'}}>
                    <pre className="milstrip-pre" style={{maxHeight:60,fontSize:11}}>{followupResults[e.event_id].milstrip}</pre>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </>
  )
}

const RENDERERS = { nmcs: NmcsBrief, open: OpenDocs, stock: StockStatus, usage: UsageTrends, jcn: CostByJcn, tat: TatReport, awop: AwopBoard }

export default function Reports() {
  const [active,  setActive]  = useState('nmcs')
  const [data,    setData]    = useState({})
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [days,    setDays]    = useState(90)

  async function run(key) {
    setActive(key); setLoading(true); setError(null)
    try {
      const fetchers = {
        nmcs:  () => reports.nmcsBrief(),
        open:  () => reports.openDocuments(),
        stock: () => reports.stockStatus(),
        usage: () => reports.usageTrends({ days }),
        jcn:   () => reports.costByJcn({ days }),
        tat:   () => reports.tat({ days }),
        awop:  () => reports.awop(),
      }
      const res = await fetchers[key]()
      setData(d => ({ ...d, [key]: res.data }))
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  const Renderer = RENDERERS[active]
  const current = data[active]

  return (
    <>
      {/* Report selector */}
      <div className="table-card">
        <div className="table-card-header">
          <span className="table-card-title">Reports</span>
          <div className="flex gap-2 items-center">
            <span className="text-dim" style={{fontSize:12}}>Period:</span>
            <select value={days} onChange={e=>setDays(parseInt(e.target.value))} style={{width:'auto'}}>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
            </select>
          </div>
        </div>
        <div style={{padding:'12px 20px',display:'flex',gap:8,flexWrap:'wrap',borderBottom:'1px solid var(--border)'}}>
          {REPORT_LIST.map(r => (
            <button key={r.key}
              className={`btn ${active===r.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => run(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        {REPORT_LIST.find(r=>r.key===active) && (
          <div style={{padding:'10px 20px',fontSize:12,color:'var(--text-dim)',borderBottom:'1px solid var(--border)'}}>
            {REPORT_LIST.find(r=>r.key===active).desc}
            {current?.generated_at && <span style={{marginLeft:12}}>Generated {new Date(current.generated_at).toLocaleTimeString()}</span>}
          </div>
        )}

        <div className="table-wrap">
          {error   ? <div className="error-banner" style={{margin:16}}>{error}</div>
           : loading ? <div className="loading">Running report…</div>
           : !current ? (
            <div className="empty"><span className="empty-icon">📊</span><div className="empty-text">Select a report above to run it</div></div>
           ) : <Renderer data={current} />}
        </div>
      </div>
    </>
  )
}
