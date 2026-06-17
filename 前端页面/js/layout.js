const NAV_ITEMS = [
  { group: '概览', items: [
    { href: 'index.html', label: 'Dashboard', icon: 'dashboard', page: 'dashboard' },
  ]},
  { group: '入库', items: [
    { href: 'inbound-scan.html', label: '入库扫码', icon: 'scan', page: 'inbound-scan' },
    { href: 'inbound-records.html', label: '入库记录', icon: 'records', page: 'inbound-records' },
  ]},
  { group: '库存 & 出库', items: [
    { href: 'customer-inventory.html', label: '客户库存', icon: 'inventory', page: 'customer-inventory' },
    { href: 'outbound-packing.html', label: '出库装箱', icon: 'packing', page: 'outbound-packing' },
  ]},
  { group: '异常 & 数据', items: [
    { href: 'exception-pool.html', label: '异常池', icon: 'exception', page: 'exception-pool', badge: 23 },
    { href: 'batch-customer-change.html', label: '批量修改客户', icon: 'batch', page: 'batch-customer-change' },
    { href: 'detail-download.html', label: '明细下载', icon: 'download', page: 'detail-download' },
  ]},
  { group: '基础数据', items: [
    { href: 'upc-library.html', label: 'UPC 商品库', icon: 'upc', page: 'upc-library' },
    { href: 'customer-management.html', label: '客户管理', icon: 'customers', page: 'customer-management' },
    { href: 'system-settings.html', label: '系统设置', icon: 'settings', page: 'system-settings' },
  ]},
];

const ICONS = {
  dashboard: '<path d="M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h5v8H3v-8zm7 3h11v5H10v-5z"/>',
  scan: '<path d="M4 4h4v4H4V4zm12 0h4v4h-4V4zM4 16h4v4H4v-4zm12 0h4v4h-4v-4zM10 8h4v8h-4V8z"/>',
  records: '<path d="M6 2h9l3 3v15a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1zm8 1.5V6h2.5L14 3.5zM8 10h8M8 14h8M8 18h5"/>',
  inventory: '<path d="M3 7l9-4 9 4-9 4-9-4zm0 6l9 4 9-4M3 13l9 4 9-4"/>',
  packing: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM12 3v18M3 8l9 5 9-5"/>',
  exception: '<path d="M12 2L2 20h20L12 2zm0 6v6m0 4h.01"/>',
  batch: '<path d="M17 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2zM9 7h6M9 11h6M9 15h4"/>',
  download: '<path d="M12 3v12m0 0l4-4m-4 4L8 11M4 17v2h16v-2"/>',
  upc: '<path d="M4 6h16M4 10h16M4 14h10M4 18h6"/>',
  customers: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm12 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
  settings: '<path d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
};

function renderSidebar(activePage) {
  const nav = NAV_ITEMS.map(group => `
    <div class="nav-group-label">${group.group}</div>
    ${group.items.map(item => `
      <a href="${item.href}" class="nav-item ${item.page === activePage ? 'active' : ''}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[item.icon]}</svg>
        ${item.label}
        ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ''}
      </a>
    `).join('')}
  `).join('');

  return `
    <aside class="sidebar">
      <div class="sidebar-logo">
        <h1>WMS Scan</h1>
        <span>美国仓库扫码管理系统</span>
      </div>
      <nav class="sidebar-nav">${nav}</nav>
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">JW</div>
          <div>
            <div class="user-name">James Wilson</div>
            <div class="user-role">仓库主管 · LA-01</div>
          </div>
        </div>
      </div>
    </aside>
  `;
}

function initLayout(activePage) {
  const root = document.getElementById('app');
  if (!root) return;
  root.innerHTML = renderSidebar(activePage) + root.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page) initLayout(page);
});
