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
  PackageSearch,
  RefreshCw,
  ScanLine,
  Settings,
  Shuffle,
  Tags,
  UserPlus,
  Users,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { getCurrentUser, login, logout, register } from '../api/auth';
import { authTokenStore } from '../api/token-store';
import { packagePrealertsEnabled } from '../config/feature-flags';
import { clearInboundScanClientState } from '../pages/inbound-scan/page';

const navigationItems = [
  {
    group: '运营',
    links: [
      { label: 'Dashboard', to: '/', icon: BarChart3 },
      { label: '入库扫码', to: '/inbound-scan', icon: ScanLine },
      ...(packagePrealertsEnabled
        ? [
            { label: '包裹预报', to: '/package-prealerts', icon: PackageSearch },
            { label: '包裹预警', to: '/package-alerts', icon: AlertTriangle },
          ]
        : []),
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
      { label: '商品管理', to: '/upc-library', icon: Tags },
      { label: '客户管理', to: '/customer-management', icon: Users },
      { label: '系统设置', to: '/system-settings', icon: Settings },
    ],
  },
];

export function AppLayout() {
  const queryClient = useQueryClient();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('admin@wms-scan.local');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [hasAuthToken, setHasAuthToken] = useState(() => Boolean(authTokenStore.getAccessToken()));
  const currentUserQuery = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
    enabled: hasAuthToken,
    retry: false,
  });

  useEffect(() => {
    const handleAuthExpired = () => {
      clearInboundScanClientState();
      queryClient.clear();
      setHasAuthToken(false);
      setAuthError('登录已过期，请重新登录。');
    };

    window.addEventListener('wms-scan-auth-expired', handleAuthExpired);
    return () => window.removeEventListener('wms-scan-auth-expired', handleAuthExpired);
  }, [queryClient]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setAuthNotice('');
    setIsLoggingIn(true);
    clearInboundScanClientState();
    authTokenStore.clear();
    setHasAuthToken(false);
    await queryClient.cancelQueries({ queryKey: ['current-user'] });
    queryClient.removeQueries({ queryKey: ['current-user'] });
    try {
      const session =
        authMode === 'register'
          ? await register({ email, name, password })
          : await login({ email, password });
      queryClient.setQueryData(['current-user'], session.user);
      setHasAuthToken(true);
      await queryClient.invalidateQueries();
      if (authMode === 'register') {
        setAuthNotice('账号已创建，并已自动登录。');
      }
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : authMode === 'register' ? '注册失败' : '登录失败',
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRefreshData = async () => {
    setIsRefreshingData(true);
    try {
      await queryClient.invalidateQueries({ refetchType: 'active' });
    } finally {
      setIsRefreshingData(false);
    }
  };

  const handleLogout = async () => {
    clearInboundScanClientState();
    void logout();
    queryClient.clear();
    setHasAuthToken(false);
    queryClient.setQueryData(['current-user'], null);
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
              onClick={handleRefreshData}
              disabled={isRefreshingData}
            >
              <RefreshCw size={16} />
              {isRefreshingData ? '刷新中' : '刷新数据'}
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
              <p>{authMode === 'register' ? 'Employee Register' : 'Employee Login'}</p>
              <h1>{authMode === 'register' ? '注册员工账号' : '登录 WMS Scan'}</h1>
            </div>
            <div className="auth-mode-tabs" role="tablist" aria-label="登录或注册">
              <button
                type="button"
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setAuthNotice('');
                }}
              >
                <LogIn size={16} />
                登录
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                  setAuthNotice('');
                  setEmail('');
                }}
              >
                <UserPlus size={16} />
                注册账号
              </button>
            </div>
            <form className="login-form" onSubmit={handleLogin}>
              {authMode === 'register' ? (
                <label>
                  <span>姓名</span>
                  <input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setAuthError('');
                    }}
                  />
                </label>
              ) : null}
              <label>
                <span>邮箱</span>
                <input
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setAuthError('');
                  }}
                />
              </label>
              <label>
                <span>密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setAuthError('');
                  }}
                />
              </label>
              <button type="submit" disabled={isLoggingIn}>
                {authMode === 'register' ? <UserPlus size={16} /> : <LogIn size={16} />}
                {isLoggingIn ? '提交中' : authMode === 'register' ? '创建账号并登录' : '登录'}
              </button>
              {authNotice ? <p className="form-success">{authNotice}</p> : null}
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
