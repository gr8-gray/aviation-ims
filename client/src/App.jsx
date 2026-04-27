import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard    from './pages/Dashboard.jsx'
import Parts        from './pages/Parts.jsx'
import Inventory    from './pages/Inventory.jsx'
import Requisitions from './pages/Requisitions.jsx'
import Aircraft     from './pages/Aircraft.jsx'
import Reports      from './pages/Reports.jsx'
import Admin        from './pages/Admin.jsx'
import Repairables  from './pages/Repairables.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index              element={<Dashboard />} />
        <Route path="parts"      element={<Parts />} />
        <Route path="inventory"  element={<Inventory />} />
        <Route path="requisitions" element={<Requisitions />} />
        <Route path="aircraft"   element={<Aircraft />} />
        <Route path="reports"    element={<Reports />} />
        <Route path="admin"       element={<Admin />} />
        <Route path="repairables" element={<Repairables />} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
