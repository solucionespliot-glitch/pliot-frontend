import { Outlet } from 'react-router-dom'
import NavBar from '../../components/NavBar'

export default function DashboardLayout() {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
      <NavBar />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  )
}
