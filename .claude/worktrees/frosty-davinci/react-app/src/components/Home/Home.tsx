import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import styles from './Home.module.css';

const Home = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t, language } = useLanguage();

  const modules = useMemo(() => [
    {
      id: 'dashboard',
      title: t('dashboard.title'),
      titleEn: 'Dashboard',
      description: t('home.dashboard.description'),
      path: '/dashboard',
      iconGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      icon: '📊',
    },
    {
      id: 'kpi',
      title: 'KPI',
      titleEn: 'KPI',
      description: t('home.kpi.description'),
      path: '/kpi',
      iconGradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
      icon: '📈',
    },
    {
      id: 'followup',
      title: t('followup.title'), // Using title key
      titleEn: 'Follow Up Issues',
      description: t('home.followup.description'),
      path: '/followup',
      iconGradient: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)',
      icon: '🔍',
    },
    {
      id: 'pqp',
      title: 'PQP',
      titleEn: 'PQP',
      description: t('home.pqp.description'),
      path: '/pqp',
      iconGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      icon: '📝',
    },
    {
      id: 'itp',
      title: 'ITP',
      titleEn: 'ITP',
      description: t('home.itp.description'),
      path: '/itp',
      iconGradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      icon: '📋',
    },
    {
      id: 'checklist',
      title: t('checklist.title'),
      titleEn: 'Checklist',
      description: t('home.checklist.description'),
      path: '/checklist',
      iconGradient: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
      icon: '✅',
    },
    {
      id: 'noi',
      title: 'NOI',
      titleEn: 'NOI',
      description: t('home.noi.description'),
      path: '/noi',
      iconGradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      icon: '📢',
    },
    {
      id: 'itr',
      title: 'ITR',
      titleEn: 'ITR',
      description: t('home.itr.description'),
      path: '/itr',
      iconGradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      icon: '📊',
    },
    {
      id: 'osd',
      title: 'OSD',
      titleEn: 'OSD',
      description: t('home.osd.description'),
      path: '/osd',
      iconGradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      icon: '⚠️',
    },
    {
      id: 'obs',
      title: 'OBS',
      titleEn: 'OBS',
      description: t('home.obs.description'),
      path: '/obs',
      iconGradient: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
      icon: '👁️',
    },
    {
      id: 'ncr',
      title: 'NCR',
      titleEn: 'NCR',
      description: t('home.ncr.description'),
      path: '/ncr',
      iconGradient: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
      icon: '❌',
    },
    {
      id: 'fat',
      title: 'FAT',
      titleEn: 'FAT',
      description: t('home.fat.description'),
      path: '/fat',
      iconGradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
      icon: '🏭',
    },
    {
      id: 'audit',
      title: t('audit.title'), // Audit usually uses description or module name
      titleEn: 'Audit',
      description: t('home.audit.description'),
      path: '/audit',
      iconGradient: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
      icon: '⚖️',
    },
    {
      id: 'contractors',
      title: t('contractors.title'),
      titleEn: 'Contractors',
      description: t('home.contractors.description'),
      path: '/contractors',
      iconGradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
      icon: '👷',
    },
    {
      id: 'km',
      title: t('km.title'),
      titleEn: 'KM',
      description: t('home.km.description'),
      path: '/km',
      iconGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      icon: '📚',
    },
    {
      id: 'iam',
      title: 'IAM',
      titleEn: 'IAM',
      description: t('home.iam.description'),
      path: '/iam',
      iconGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      icon: '👤',
    },
    {
      id: 'document-naming-rules',
      title: t('namingRules.title'),
      titleEn: 'Document Naming Rules',
      description: t('namingRules.subtitle'),
      path: '/document-naming-rules',
      iconGradient: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
      icon: '📄',
    },
    {
      id: 'owner-performance',
      title: t('home.ownerPerformance.description'), // Using description as title for consistency with others if no specific title key
      titleEn: 'Owner Performance',
      description: t('home.ownerPerformance.description'),
      path: '/owner-performance',
      iconGradient: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
      icon: '🏆',
    },
  ], [t, language]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Qualitas</h1>
          <p className={styles.welcomeText}>{t('home.welcome')}, {user?.full_name || user?.username || t('home.adminUser')}!</p>
        </div>
        <button className={styles.logoutButton} onClick={logout}>
          {t('home.logout')}
        </button>
      </div>
      <div className={styles.modulesGrid}>
        {modules.map((module) => (
          <div
            key={module.id}
            className={styles.moduleCard}
            onClick={() => navigate(module.path)}
          >
            <div
              className={styles.moduleIcon}
              style={{ background: module.iconGradient }}
            >
              <span className={styles.iconEmoji}>{module.icon}</span>
            </div>
            <h2 className={styles.moduleTitle}>{module.title}</h2>
            <p className={styles.moduleDescription}>{module.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;
