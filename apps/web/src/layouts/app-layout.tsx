import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardList,
  Download,
  LogIn,
  LogOut,
  PackageCheck,
  RefreshCw,
  ScanLine,
  Settings,
  Shuffle,
  Tags,
  Users,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { getCurrentUser, login, logout } from '../api/auth';

const navigationItems = [
  {
    group: '运营',
    links: [
      { label: 'Dashboard', to: '/', icon: BarChart3 },
      { label: '入库扫码', to: '/inbound-scan', icon: ScanLine },
      { label: '入库记录', to: '/inbound-records', icon: ClipboardList },
      { label: '客户库存', to: '/customer-inventory', icon: Boxes },
      { label: '出库装箱', to: '/outbound-packing', icon: PackageCheck },
    ],
  },
  {
    group: '处理',
    links: [
      { label: '异常池', to: '/exception-pool', icon: AlertTriangle },
      { label: '批量修改客户', to: '/batch-customer-change', icon: Shuffle },
      { label: '明细下载', to: '/detail-download', icon: Download },
    ],
  },
  {
    group: '基础资料',
    links: [
      { label: 'UPC 商品库', to: '/upc-library', icon: Tags },
      { label: '客户管理', to: '/customer-management', icon: Users },
      { label: '系统设置', to: '/system-settings', icon: Settings },
    ],
  },
];

export function AppLayout() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('admin@wms-scan.local');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const currentUserQuery = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
    retry: false,
  });

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setIsLoggingIn(true);
    try {
      const session = await login({ email, password });
      queryClient.setQueryData(['current-user'], session.user);
      await queryClient.invalidateQueries();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '登录失败');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>WMS Scan</h1>
          <span>美国仓库扫码管理系统</span>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigationItems.map((group) => (
            <div key={group.group} className="nav-group">
              <div className="nav-group-label">{group.group}</div>
              {group.links.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                  >
                    <Icon />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{currentUserQuery.data?.name?.slice(0, 1) ?? 'A'}</div>
            <div>
              <div className="user-name">{currentUserQuery.data?.name ?? 'Local Admin'}</div>
              <div className="user-role">本地测试环境</div>
            </div>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <div className="topbar">
          <div>
            <strong>{currentUserQuery.data?.name ?? '未登录'}</strong>
            <span>{currentUserQuery.data?.email ?? '请先登录本地测试账号'}</span>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="icon-button"
              onClick={() => currentUserQuery.refetch()}
            >
              <RefreshCw size={16} />
              刷新
            </button>
            {currentUserQuery.data ? (
              <button type="button" className="icon-button danger" onClick={handleLogout}>
                <LogOut size={16} />
                退出
              </button>
            ) : null}
          </div>
        </div>

        {!currentUserQuery.data ? (
          <section className="login-panel panel">
            <div className="page-heading compact">
              <p>Local Test Login</p>
              <h1>登录 WMS Scan</h1>
            </div>
            <form className="login-form" onSubmit={handleLogin}>
              <label>
                <span>邮箱</span>
                <input value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label>
                <span>密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button type="submit" disabled={isLoggingIn}>
                <LogIn size={16} />
                {isLoggingIn ? '登录中' : '登录'}
              </button>
              {authError ? <p className="form-error">{authError}</p> : null}
            </form>
          </section>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
