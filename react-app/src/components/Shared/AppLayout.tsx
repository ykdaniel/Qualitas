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
  Workflow as WorkflowIcon,
  type LucideIcon,
} from 'lucide-react';

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

  const modules = useMemo(() => [
    { id: 'home' as ModuleId, title: t('home.welcome'), path: '/', color: '#b8945a' },
    { id: 'dashboard' as ModuleId, title: t('dashboard.title'), path: '/dashboard', color: '#667eea' },
    { id: 'workflow' as ModuleId, title: t('workflow.title'), path: '/workflow', color: '#0ea5e9' },
    { id: 'kpi' as ModuleId, title: 'KPI', path: '/kpi', color: '#11998e' },
    { id: 'followup' as ModuleId, title: t('followup.title'), path: '/followup', color: '#ff6b6b' },
    { id: 'pqp' as ModuleId, title: 'PQP', path: '/pqp', color: '#f59e0b' },
    { id: 'itp' as ModuleId, title: 'ITP', path: '/itp', color: '#f093fb' },
    { id: 'checklist' as ModuleId, title: t('checklist.title'), path: '/checklist', color: '#43e97b' },
    { id: 'noi' as ModuleId, title: 'NOI', path: '/noi', color: '#4facfe' },
    { id: 'itr' as ModuleId, title: 'ITR', path: '/itr', color: '#5ec7f3' },
    { id: 'osd' as ModuleId, title: 'OSD', path: '/osd', color: '#fa709a' },
    { id: 'obs' as ModuleId, title: 'OBS', path: '/obs', color: '#30cfd0' },
    { id: 'ncr' as ModuleId, title: 'NCR', path: '/ncr', color: '#f7971e' },
    { id: 'fat' as ModuleId, title: 'FAT', path: '/fat', color: '#ff9a9e' },
    { id: 'audit' as ModuleId, title: t('audit.title'), path: '/audit', color: '#10b981' },
    { id: 'contractors' as ModuleId, title: t('contractors.title'), path: '/contractors', color: '#fda085' },
    { id: 'km' as ModuleId, title: t('km.title'), path: '/km', color: '#a18cd1' },
    { id: 'iam' as ModuleId, title: 'IAM', path: '/iam', color: '#667eea' },
    { id: 'document-naming-rules' as ModuleId, title: t('namingRules.title'), path: '/document-naming-rules', color: '#0ea5e9' },
    { id: 'owner-performance' as ModuleId, title: t('home.ownerPerformance.title'), path: '/owner-performance', color: '#f6d365' },
  ], [t]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

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
          {modules.map((module) => {
            const IconComponent = MODULE_ICONS[module.id];
            const active = isActive(module.path);
            return (
              <button
                key={module.id}
                type="button"
                className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                onClick={() => navigate(module.path)}
                style={{ '--card-color': module.color } as React.CSSProperties}
              >
                <div className={styles.navIcon}>
                  {IconComponent && <IconComponent size={16} strokeWidth={2} />}
                </div>
                <span className={styles.navLabel}>{module.title}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.topBar}>
          <div className={styles.userBlock}>
            <span className={styles.userName}>{user?.full_name || user?.username || t('home.adminUser')}</span>
          </div>
          <div className={styles.topActions}>
            <ProjectSelector />
            <button className={styles.logoutButton} onClick={logout}>
              <LogOut size={16} />
              {t('home.logout')}
            </button>
          </div>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
