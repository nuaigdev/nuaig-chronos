'use client'

import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import MobileHeader from '@/components/layout/MobileHeader'
import MobileBottomNav from '@/components/layout/MobileBottomNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Desktop sidebar — hidden on mobile via CSS */}
      <div className="desktop-only">
        <Sidebar />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Desktop topbar — hidden on mobile via CSS */}
        <div className="desktop-only">
          <TopBar />
        </div>

        {/* Mobile header — hidden on desktop via CSS */}
        <div className="mobile-only">
          <MobileHeader />
        </div>

        <main className="main-content" style={{ flex: 1, overflowY: 'auto', background: 'var(--chronos-bg)' }}>
          {children}
        </main>

        {/* Mobile bottom nav — hidden on desktop via CSS */}
        <div className="mobile-only">
          <MobileBottomNav />
        </div>
      </div>
    </div>
  )
}
