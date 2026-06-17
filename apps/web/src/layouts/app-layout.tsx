import { NavLink, Outlet } from 'react-router-dom';

const navigationItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'Inbound Scan', to: '/inbound-scan' },
  { label: 'Inbound Records', to: '/inbound-records' },
  { label: 'Customer Inventory', to: '/customer-inventory' },
  { label: 'Outbound Packing', to: '/outbound-packing' },
  { label: 'Exception Pool', to: '/exception-pool' },
  { label: 'Batch Customer Change', to: '/batch-customer-change' },
  { label: 'Detail Download', to: '/detail-download' },
  { label: 'UPC Library', to: '/upc-library' },
  { label: 'Customer Management', to: '/customer-management' },
  { label: 'System Settings', to: '/system-settings' },
];

export function AppLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <strong>WMS Scan</strong>
          <span>美国仓库扫码管理系统</span>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
