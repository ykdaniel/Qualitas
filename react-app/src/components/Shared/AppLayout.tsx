import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import ProjectSelector from './ProjectSelector';
import styles from './AppLayout.module.css';
import {
  LayoutDashboard, TrendingUp, Search, FileText, ClipboardList,
  CheckSquare, Bell, GitPullRequest, AlertTriangle, Eye, XOctagon,
  Factory, Scale, HardHat, BookOpen, Shield, FileCode2, Trophy, LogOut, Home as HomeIcon,
  Workflow as WorkflowIcon, ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

type ModuleId =
  | 'home' | 'dashboard' | 'workflow' | 'kpi' | 'followup' | 'pqp' | 'itp' | 'checklist'
  | 'noi' | 'itr' | 'osd' | 'obs' | 'ncr' | 'fat' | 'audit'
  | 'contractors' | 'km' | 'iam' | 'document-naming-rules' | 'owner-performance';

const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  home: HomeIcon,
  dashboard: LayoutDashboard,
  workflow: WorkflowIcon,
  kpi: TrendingUp,
  followup: Search,
  pqp: FileText,
  itp: ClipboardList,
  checklist: CheckSquare,
  noi: Bell,
  itr: GitPullRequest,
  osd: AlertTriangle,
  obs: Eye,
  ncr: XOctagon,
  fat: Factory,
  audit: Scale,
  contractors: HardHat,
  km: BookOpen,
  iam: Shield,
  'document-naming-rules': FileCode2,
  'owner-performance': Trophy,
};

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  const mainModules = useMemo(() => [
    { id: 'home' as ModuleId, title: t('home.welcome'), path: '/', color: '#b8945a' },
    { id: 'dashboard' as ModuleId, title: t('dashboard.title'), path: '/dashboard', color: '#667eea' },
    { id: 'workflow' as ModuleId, title: t('workflow.title'), path: '/workflow', color: '#0ea5e9' },
    { id: 'kpi' as ModuleId, title: 'KPI', path: '/kpi', color: '#11998e' },
    { id: 'followup' as ModuleId, title: t('followup.title'), path: '/followup', color: '#ff6b6b' },
    { id: 'fat' as ModuleId, title: 'FAT', path: '/fat', color: '#ff9a9e' },
    { id: 'audit' as ModuleId, title: t('audit.title'), path: '/audit', color: '#10b981' },
    { id: 'km' as ModuleId, title: t('km.title'), path: '/km', color: '#a18cd1' },
    { id: 'owner-performance' as ModuleId, title: t('home.ownerPerformance.title'), path: '/owner-performance', color: '#f6d365' },
  ], [t]);

  const qcModules = useMemo(() => [
    { id: 'pqp' as ModuleId, title: 'PQP', path: '/pqp', color: '#f59e0b' },
    { id: 'itp' as ModuleId, title: 'ITP', path: '/itp', color: '#f093fb' },
    { id: 'checklist' as ModuleId, title: t('checklist.title'), path: '/checklist', color: '#43e97b' },
    { id: 'noi' as ModuleId, title: 'NOI', path: '/noi', color: '#4facfe' },
    { id: 'itr' as ModuleId, title: 'ITR', path: '/itr', color: '#5ec7f3' },
  ], [t]);

  const findingsModules = useMemo(() => [
    { id: 'osd' as ModuleId, title: 'OSD', path: '/osd', color: '#fa709a' },
    { id: 'obs' as ModuleId, title: 'OBS', path: '/obs', color: '#30cfd0' },
    { id: 'ncr' as ModuleId, title: 'NCR', path: '/ncr', color: '#f7971e' },
  ], []);

  const settingsModules = useMemo(() => [
    { id: 'iam' as ModuleId, title: 'IAM', path: '/iam', color: '#667eea' },
    { id: 'contractors' as ModuleId, title: t('contractors.title'), path: '/contractors', color: '#fda085' },
    { id: 'document-naming-rules' as ModuleId, title: t('namingRules.title'), path: '/document-naming-rules', color: '#0ea5e9' },
  ], [t]);

  const modules = useMemo(
    () => [...mainModules, ...qcModules, ...findingsModules, ...settingsModules],
    [mainModules, qcModules, findingsModules, settingsModules],
  );

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Derive breadcrumb from the current route by matching against the non-home
  // modules (home is implicit). Detail paths like /itp/:id fall through to
  // their parent module via startsWith.
  const activeModule = modules
    .filter((m) => m.path !== '/')
    .find((m) => isActive(m.path));

  const qcActive = qcModules.some((m) => isActive(m.path));
  const [qcOpen, setQcOpen] = useState(qcActive);

  const findingsActive = findingsModules.some((m) => isActive(m.path));
  const [findingsOpen, setFindingsOpen] = useState(findingsActive);

  const settingsActive = settingsModules.some((m) => isActive(m.path));
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);

  type NavModule = { id: ModuleId; title: string; path: string; color: string };
  const renderNavItem = (module: NavModule, nested: boolean) => {
    const IconComponent = MODULE_ICONS[module.id];
    const active = isActive(module.path);
    return (
      <button
        key={module.id}
        type="button"
        className={`${styles.navItem} ${nested ? styles.navItemNested : ''} ${active ? styles.navItemActive : ''}`}
        onClick={() => navigate(module.path)}
        style={{ '--card-color': module.color } as React.CSSProperties}
      >
        <div className={styles.navIcon}>
          {IconComponent && <IconComponent size={16} strokeWidth={2} />}
        </div>
        <span className={styles.navLabel}>{module.title}</span>
      </button>
    );
  };

  const renderGroupHeader = (
    label: string,
    groupActive: boolean,
    open: boolean,
    toggle: () => void,
  ) => (
    <button
      type="button"
      className={`${styles.navGroupHeader} ${groupActive ? styles.navGroupHeaderActive : ''}`}
      onClick={toggle}
      aria-expanded={open}
    >
      <span className={styles.navGroupLabel}>{label}</span>
      <ChevronDown
        size={14}
        className={`${styles.navGroupCaret} ${open ? styles.navGroupCaretOpen : ''}`}
        strokeWidth={2}
      />
    </button>
  );

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <div className={styles.logoMark}>Q</div>
          <div>
            <div className={styles.brandTitle}>Qualitas</div>
            <div className={styles.brandSubtitle}>v1.0</div>
          </div>
        </div>

        <nav className={styles.sidebarNav}>
          {mainModules.map((module) => renderNavItem(module, false))}

          {renderGroupHeader(
            t('sidebar.section.qc'),
            qcActive,
            qcOpen,
            () => setQcOpen((open) => !open),
          )}
          {qcOpen && qcModules.map((module) => renderNavItem(module, true))}

          {renderGroupHeader(
            t('sidebar.section.findings'),
            findingsActive,
            findingsOpen,
            () => setFindingsOpen((open) => !open),
          )}
          {findingsOpen && findingsModules.map((module) => renderNavItem(module, true))}

          {renderGroupHeader(
            t('sidebar.section.settings'),
            settingsActive,
            settingsOpen,
            () => setSettingsOpen((open) => !open),
          )}
          {settingsOpen && settingsModules.map((module) => renderNavItem(module, true))}
        </nav>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.topBar}>
          <nav className={styles.breadcrumb} aria-label="breadcrumb">
            <button
              type="button"
              className={styles.crumbLink}
              onClick={() => navigate('/')}
            >
              {t('home.welcome')}
            </button>
            {activeModule && (
              <>
                <span className={styles.crumbSep}>/</span>
                <span className={styles.crumbCurrent}>{activeModule.title}</span>
              </>
            )}
          </nav>
          <div className={styles.topActions}>
            <span className={styles.userName}>{user?.full_name || user?.username || t('home.adminUser')}</span>
            <ProjectSelector />
            <button className={styles.logoutButton} onClick={logout}>
              <LogOut size={16} />
              {t('home.logout')}
            </button>
          </div>
        </header>

        <main className={styles.content} data-shell-content>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
