import { Outlet } from 'react-router-dom';

export function DashboardLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <strong>WMS Scan</strong>
        <span>美国仓库扫码管理系统</span>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
