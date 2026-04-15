import { useEffect, useState } from 'react'
import { reports, aircraft as acApi, reqs } from '../api.js'

function StatusCard({ color, label, value, sub }) {
  return (
    <div className={`status-card ${color}`}>
      <div className="sc-label">{label}</div>
      <div className="sc-value">{value ?? '—'}</div>
      {sub && <div className="sc-sub">{sub}</div>}
    </div>
  )
}

function PriBadge({ pri }) {
  const cls = pri === '01' ? 'badge-red' : pri === '02' ? 'badge-amber' : 'badge-dim'
  const label = pri === '01' ? 'NMCS' : pri === '02' ? 'PMCS' : `P${pri}`
  return <span className={`badge ${cls}`}>{label}</span>
}

function StatusBadge({ status }) {
  const map = {
    submitted:   'badge-blue',
    due_in:      'badge-green',
    backordered: 'badge-amber',
    shipped:     'badge-blue',
    received:    'badge-green',
    cancelled:   'badge-dim',
  }
  return <span className={`badge ${map[status] || 'badge-dim'}`}>{status}</span>
}

export default function Dashboard() {
  const [nmcs,    setNmcs]    = useState(null)
  const [openReqs, setOpenReqs] = useState(null)
  const [stock,   setStock]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    Promise.allSettled([
      reports.nmcsBrief(),
      reqs.list({ open: true, limit: 15 }),
      reports.stockStatus({ low: true }),
    ]).then(([n, r, s]) => {
      if (n.status === 'fulfilled') setNmcs(n.value.data)
      if (r.status === 'fulfilled') setOpenReqs(r.value.data)
      if (s.status === 'fulfilled') setStock(s.value.data)
      if (n.status === 'rejected' && r.status === 'rejected') {
        setError('Could not connect to server. Is the backend running?')
      }
      setLoading(false)
    })
  }, [])

  const nmcsCount  = nmcs?.summary?.total_nmcs ?? '—'
  const reqCount   = openReqs?.count ?? '—'
  const lowStock   = stock?.low_stock ?? '—'
  const dueIn      = openReqs?.requisitions?.filter(r => r.status === 'due_in').length ?? '—'

  if (loading) return <div className="loading">Loading dashboard…</div>

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      {/* Status cards */}
      <div className="status-cards">
        <StatusCard color="red"   label="NMCS Aircraft"  value={nmcsCount} sub="aircraft grounded" />
        <StatusCard color="amber" label="Open Reqs"      value={reqCount}  sub="non-received docs" />
        <StatusCard color="blue"  label="Due-In Today"   value={dueIn}     sub="expected receipts" />
        <StatusCard color="green" label="Low Stock Items" value={lowStock} sub="at or below reorder" />
      </div>

      {/* NMCS table */}
      <div className="table-card">
        <div className="table-card-header">
          <span className="table-card-title">NMCS / PMCS Status</span>
          <span className="text-dim" style={{ fontSize: 12 }}>
            {nmcs?.summary?.total_nmcs ?? 0} NMCS · {nmcs?.summary?.total_pmcs ?? 0} PMCS · avg {nmcs?.summary?.avg_days ?? 0}d down
          </span>
        </div>
        <div className="table-wrap">
          {!nmcs?.events?.length ? (
            <div className="empty"><span className="empty-icon">✅</span><div className="empty-text">No open NMCS events</div></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Type</th><th>BUNO</th><th>MDS</th><th>Part</th>
                  <th>NSN</th><th>JCN</th><th>Days Down</th><th>Req Status</th>
                </tr>
              </thead>
              <tbody>
                {nmcs.events.map((e) => (
                  <tr key={e.event_id}>
                    <td><span className={`badge ${e.type === 'NMCS' ? 'badge-red' : 'badge-amber'}`}>{e.type}</span></td>
                    <td className="td-primary td-mono">{e.buno}</td>
                    <td className="text-muted">{e.mds}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.part_description}</td>
                    <td className="td-mono">{e.nsn}</td>
                    <td className="td-mono">{e.jcn || '—'}</td>
                    <td className={Number(e.days_open) > 10 ? 'text-red fw-600' : ''}>{e.days_open}d</td>
                    <td>{e.req_status ? <StatusBadge status={e.req_status} /> : <span className="text-dim">No req</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Open reqs table */}
      <div className="table-card">
        <div className="table-card-header">
          <span className="table-card-title">Open Requisitions</span>
        </div>
        <div className="table-wrap">
          {!openReqs?.requisitions?.length ? (
            <div className="empty"><span className="empty-icon">📋</span><div className="empty-text">No open requisitions</div></div>
          ) : (
            <table>
              <thead>
                <tr><th>Doc Number</th><th>NSN</th><th>Description</th><th>Pri</th><th>Status</th><th>BUNO</th></tr>
              </thead>
              <tbody>
                {openReqs.requisitions.slice(0, 15).map((r) => (
                  <tr key={r.req_id}>
                    <td className="td-mono">{r.document_number}</td>
                    <td className="td-mono">{r.nsn}</td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</td>
                    <td><span className={`pri pri-${r.priority}`}>{r.priority}</span></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="td-mono">{r.buno || '—'}</td>
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
