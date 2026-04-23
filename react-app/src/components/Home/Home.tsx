import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import styles from './Home.module.css';
import {
  ClipboardList, AlertTriangle, CheckSquare, Activity,
} from 'lucide-react';

type SummaryCard = {
  label: string;
  value: string;
  delta?: string;
  icon: React.ReactNode;
  accent: string;
};

const Home = () => {
  const { t } = useLanguage();
  const { user } = useAuth();

  const summary: SummaryCard[] = [
    {
      label: t('home.summary.openItp'),
      value: '—',
      icon: <ClipboardList size={18} strokeWidth={1.8} />,
      accent: '#b8945a',
    },
    {
      label: t('home.summary.pendingNcr'),
      value: '—',
      icon: <AlertTriangle size={18} strokeWidth={1.8} />,
      accent: '#c8753f',
    },
    {
      label: t('home.summary.checklistToday'),
      value: '—',
      icon: <CheckSquare size={18} strokeWidth={1.8} />,
      accent: '#7a8f5a',
    },
    {
      label: t('home.summary.activity7d'),
      value: '—',
      icon: <Activity size={18} strokeWidth={1.8} />,
      accent: '#8a6a3a',
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          {t('home.welcome')},&nbsp;
          <span className={styles.userName}>{user?.full_name || user?.username || t('home.adminUser')}</span>
        </h1>
        <p className={styles.pageSubtitle}>{t('home.overview.subtitle')}</p>
      </div>

      <section className={styles.summaryGrid}>
        {summary.map((card) => (
          <div key={card.label} className={styles.summaryCard} style={{ '--accent': card.accent } as React.CSSProperties}>
            <div className={styles.summaryIcon}>{card.icon}</div>
            <div className={styles.summaryBody}>
              <div className={styles.summaryLabel}>{card.label}</div>
              <div className={styles.summaryValue}>{card.value}</div>
            </div>
          </div>
        ))}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>{t('home.recentActivity.title')}</h2>
        </div>
        <div className={styles.panelEmpty}>
          {t('home.recentActivity.empty')}
        </div>
      </section>
    </div>
  );
};

export default Home;
