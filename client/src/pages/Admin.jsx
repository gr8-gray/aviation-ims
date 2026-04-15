import { useEffect, useState } from 'react'
import { users } from '../api.js'

function EditUserModal({ user, units, onClose, onSuccess }) {
  const [form, setForm] = useState({ role: user.role||'clerk', unit_id: user.unit_id||'', name: user.name||'', rank: user.rank||'' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      await users.update(user.user_id, form)
      onSuccess?.(); onClose()
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Edit User — {user.edipi}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="form-grid">
              <div className="form-group full"><label>Name</label><input value={form.name} onChange={e=>set('name',e.target.value)} /></div>
              <div className="form-group"><label>Rank</label><input value={form.rank} onChange={e=>set('rank',e.target.value)} placeholder="e.g. SSgt" /></div>
              <div className="form-group">
                <label>Role</label>
                <select value={form.role} onChange={e=>set('role',e.target.value)}>
                  <option value="clerk">Clerk</option>
                  <option value="sncoic">SNCOIC</option>
                  <option value="officer">Officer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group full">
                <label>Unit</label>
                <select value={form.unit_id} onChange={e=>set('unit_id',e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {units.map(u => <option key={u.unit_id} value={u.unit_id}>{u.name} {u.uic ? `(${u.uic})` : ''}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading?'Saving…':'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddUnitModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ name:'', uic:'', location:'' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      await users.createUnit(form)
      onSuccess?.(); onClose()
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add Unit</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <div className="form-grid">
              <div className="form-group full"><label>Unit Name *</label><input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. VMGR-352" required /></div>
              <div className="form-group"><label>UIC / DoDAAC</label><input value={form.uic} onChange={e=>set('uic',e.target.value)} placeholder="6-char" maxLength={10} /></div>
              <div className="form-group"><label>Location</label><input value={form.location} onChange={e=>set('location',e.target.value)} placeholder="e.g. MCAS Miramar" /></div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading?'Adding…':'Add Unit'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const ROLE_BADGE = { clerk:'badge-dim', sncoic:'badge-blue', officer:'badge-amber', admin:'badge-red' }

export default function Admin() {
  const [userList, setUserList] = useState([])
  const [unitList, setUnitList] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [editUser, setEditUser] = useState(null)
  const [showUnit, setShowUnit] = useState(false)
  const [tab,      setTab]      = useState('users')

  async function load() {
    setLoading(true)
    try {
      const [u, un] = await Promise.all([users.list(), users.units()])
      setUserList(u.data.users   || [])
      setUnitList(un.data.units  || [])
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <>
      {editUser && <EditUserModal user={editUser} units={unitList} onClose={() => setEditUser(null)} onSuccess={load} />}
      {showUnit && <AddUnitModal onClose={() => setShowUnit(false)} onSuccess={load} />}

      <div className="flex gap-2">
        <button className={`btn ${tab==='users'?'btn-primary':'btn-secondary'}`} onClick={() => setTab('users')}>Users ({userList.length})</button>
        <button className={`btn ${tab==='units'?'btn-primary':'btn-secondary'}`} onClick={() => setTab('units')}>Units ({unitList.length})</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {tab === 'users' && (
        <div className="table-card">
          <div className="table-card-header">
            <span className="table-card-title">Users</span>
            <span className="text-dim" style={{fontSize:12}}>CAC auth — users appear on first login</span>
          </div>
          <div className="table-wrap">
            {loading ? <div className="loading">Loading…</div> : !userList.length ? (
              <div className="empty"><span className="empty-icon">👤</span><div className="empty-text">No users yet — they appear on first CAC login</div></div>
            ) : (
              <table>
                <thead><tr><th>EDIPI</th><th>Name</th><th>Rank</th><th>Role</th><th>Unit</th><th>Last Login</th><th></th></tr></thead>
                <tbody>
                  {userList.map(u => (
                    <tr key={u.user_id}>
                      <td className="td-mono">{u.edipi}</td>
                      <td className="td-primary">{u.name}</td>
                      <td>{u.rank||'—'}</td>
                      <td><span className={`badge ${ROLE_BADGE[u.role]||'badge-dim'}`}>{u.role}</span></td>
                      <td>{u.unit_name||<span className="badge badge-red">Unassigned</span>}</td>
                      <td className="text-dim">{u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
                      <td><button className="btn btn-secondary btn-sm" onClick={() => setEditUser(u)}>Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'units' && (
        <div className="table-card">
          <div className="table-card-header">
            <span className="table-card-title">Units</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowUnit(true)}>+ Add Unit</button>
          </div>
          <div className="table-wrap">
            {loading ? <div className="loading">Loading…</div> : !unitList.length ? (
              <div className="empty"><span className="empty-icon">🏢</span><div className="empty-text">No units configured</div></div>
            ) : (
              <table>
                <thead><tr><th>Name</th><th>UIC / DoDAAC</th><th>Location</th><th>Parent Unit</th></tr></thead>
                <tbody>
                  {unitList.map(u => (
                    <tr key={u.unit_id}>
                      <td className="td-primary">{u.name}</td>
                      <td className="td-mono">{u.uic||'—'}</td>
                      <td>{u.location||'—'}</td>
                      <td>{u.parent_name||<span className="text-dim">—</span>}</td>
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
