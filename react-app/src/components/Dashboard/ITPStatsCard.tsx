import { useITPStore } from '../../store/itpStore';
import { useDashboardFilterStore } from '../../store/dashboardFilterStore';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import styles from './Dashboard.module.css';

const ITPStatsCard: React.FC = () => {
  const itpList = useITPStore(state => state.itpList);
  const selectedVendor = useDashboardFilterStore(state => state.selectedVendor);
  const navigate = useNavigate();
  const { t } = useLanguage();

  const stats = useMemo(() => {
    const filteredList = selectedVendor === 'all'
      ? itpList
      : itpList.filter(item => item.vendor === selectedVendor);

    const total = filteredList.filter(item => item.status.toLowerCase() !== 'void').length;
    const submitted = filteredList.filter(item => {
      const status = item.status.toLowerCase();
      return status !== 'void' && status !== 'no submit' && status !== 'nosubmit';
    }).length;
    const approved = filteredList.filter(item => {
      const status = item.status.toLowerCase();
      return status === 'approved' || status === 'approved with comments';
    }).length;
    const submittedPercent = total > 0 ? Math.round((submitted / total) * 100) : 0;
    const approvedPercent = total > 0 ? Math.round((approved / total) * 100) : 0;

    return {
      total,
      submitted,
      approved,
      submittedPercent,
      approvedPercent,
    };
  }, [itpList, selectedVendor]);

  return (
    <div className={styles.itpStatsCard}>
      <div className={styles.itpStatsContent}>
        <div className={styles.itpStatsRow}>
          <span className={styles.itpStatsLabel}>{t('dashboard.itpTotal') || 'ITP Total'}</span>
          <span className={styles.itpStatsValue}>{stats.total}</span>
        </div>
        <div className={styles.itpStatsRow}>
          <span className={styles.itpStatsLabel}>{t('dashboard.submitted') || 'Submitted'}</span>
          <span className={styles.itpStatsValue} style={{ color: '#1e293b', fontSize: '20px', fontWeight: '600' }}>
            {stats.submitted} ({stats.submittedPercent}%)
          </span>
        </div>
        <div className={styles.itpStatsRow}>
          <span className={styles.itpStatsLabel}>{t('status.approved') || 'Approved'}</span>
          <span className={styles.itpStatsValue} style={{ color: '#1e293b', fontSize: '20px', fontWeight: '600' }}>
            {stats.approved} ({stats.approvedPercent}%)
          </span>
        </div>
      </div>
      <button className={styles.itpStatsButton} onClick={() => navigate('/itp')}>
        {t('common.viewDetails') || 'View Details ->'}
      </button>
    </div>
  );
};

export default ITPStatsCard;
