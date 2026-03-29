import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import styles from './Home.module.css';
import {
  LayoutDashboard, TrendingUp, Search, FileText, ClipboardList,
  CheckSquare, Bell, GitPullRequest, AlertTriangle, Eye, XOctagon,
  Factory, Scale, HardHat, BookOpen, Shield, FileCode2, Trophy, LogOut,
  type LucideIcon,
} from 'lucide-react';

type ModuleId =
  | 'dashboard' | 'kpi' | 'followup' | 'pqp' | 'itp' | 'checklist'
  | 'noi' | 'itr' | 'osd' | 'obs' | 'ncr' | 'fat' | 'audit'
  | 'contractors' | 'km' | 'iam' | 'document-naming-rules' | 'owner-performance';

const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  dashboard: LayoutDashboard,
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

const Home = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  const modules = useMemo(() => [
    {
      id: 'dashboard' as ModuleId,
      title: t('dashboard.title'),
      description: t('home.dashboard.description'),
      path: '/dashboard',
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#667eea',
    },
    {
      id: 'kpi' as ModuleId,
      title: 'KPI',
      description: t('home.kpi.description'),
      path: '/kpi',
      gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
      color: '#11998e',
    },
    {
      id: 'followup' as ModuleId,
      title: t('followup.title'),
      description: t('home.followup.description'),
      path: '/followup',
      gradient: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)',
      color: '#ff6b6b',
    },
    {
      id: 'pqp' as ModuleId,
      title: 'PQP',
      description: t('home.pqp.description'),
      path: '/pqp',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      color: '#f59e0b',
    },
    {
      id: 'itp' as ModuleId,
      title: 'ITP',
      description: t('home.itp.description'),
      path: '/itp',
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      color: '#f093fb',
    },
    {
      id: 'checklist' as ModuleId,
      title: t('checklist.title'),
      description: t('home.checklist.description'),
      path: '/checklist',
      gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      color: '#43e97b',
    },
    {
      id: 'noi' as ModuleId,
      title: 'NOI',
      description: t('home.noi.description'),
      path: '/noi',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      color: '#4facfe',
    },
    {
      id: 'itr' as ModuleId,
      title: 'ITR',
      description: t('home.itr.description'),
      path: '/itr',
      gradient: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
      color: '#5ec7f3',
    },
    {
      id: 'osd' as ModuleId,
      title: 'OSD',
      description: t('home.osd.description'),
      path: '/osd',
      gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      color: '#fa709a',
    },
    {
      id: 'obs' as ModuleId,
      title: 'OBS',
      description: t('home.obs.description'),
      path: '/obs',
      gradient: 'linear-gradient(135deg, #30cfd0 0%, #667eea 100%)',
      color: '#30cfd0',
    },
    {
      id: 'ncr' as ModuleId,
      title: 'NCR',
      description: t('home.ncr.description'),
      path: '/ncr',
      gradient: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
      color: '#f7971e',
    },
    {
      id: 'fat' as ModuleId,
      title: 'FAT',
      description: t('home.fat.description'),
      path: '/fat',
      gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
      color: '#ff9a9e',
    },
    {
      id: 'audit' as ModuleId,
      title: t('audit.title'),
      description: t('home.audit.description'),
      path: '/audit',
      gradient: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
      color: '#10b981',
    },
    {
      id: 'contractors' as ModuleId,
      title: t('contractors.title'),
      description: t('home.contractors.description'),
      path: '/contractors',
      gradient: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
      color: '#fda085',
    },
    {
      id: 'km' as ModuleId,
      title: t('km.title'),
      description: t('home.km.description'),
      path: '/km',
      gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
      color: '#a18cd1',
    },
    {
      id: 'iam' as ModuleId,
      title: 'IAM',
      description: t('home.iam.description'),
      path: '/iam',
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#667eea',
    },
    {
      id: 'document-naming-rules' as ModuleId,
      title: t('namingRules.title'),
      description: t('namingRules.subtitle'),
      path: '/document-naming-rules',
      gradient: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
      color: '#0ea5e9',
    },
    {
      id: 'owner-performance' as ModuleId,
      title: t('home.ownerPerformance.title'),
      description: t('home.ownerPerformance.description'),
      path: '/owner-performance',
      gradient: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
      color: '#f6d365',
    },
  ], [t]);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logoMark}>Q</div>
          <div>
            <h1 className={styles.title}>Qualitas</h1>
            <p className={styles.welcomeText}>
              {t('home.welcome')}, <span className={styles.userName}>{user?.full_name || user?.username || t('home.adminUser')}</span>
            </p>
          </div>
        </div>
        <button className={styles.logoutButton} onClick={logout}>
          <LogOut size={16} />
          {t('home.logout')}
        </button>
      </div>

      {/* Modules Grid */}
      <div className={styles.modulesGrid}>
        {modules.map((module) => {
          const IconComponent = MODULE_ICONS[module.id];
          return (
            <div
              key={module.id}
              className={styles.moduleCard}
              onClick={() => navigate(module.path)}
              style={{ '--card-color': module.color } as React.CSSProperties}
            >
              <div className={styles.moduleIconWrap} style={{ background: module.gradient }}>
                {IconComponent && <IconComponent size={26} strokeWidth={1.8} />}
              </div>
              <div className={styles.moduleCardBody}>
                <h2 className={styles.moduleTitle}>{module.title}</h2>
                <p className={styles.moduleDescription}>{module.description}</p>
              </div>
              <div className={styles.moduleArrow}>→</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Home;
