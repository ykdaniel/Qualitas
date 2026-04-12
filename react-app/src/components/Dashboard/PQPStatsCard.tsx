import { usePQPStore } from '../../store/pqpStore';
import { useDashboardFilterStore } from '../../store/dashboardFilterStore';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import styles from './Dashboard.module.css';

const PQPStatsCard: React.FC = () => {
  const pqpList = usePQPStore(state => state.pqpList);
  const selectedVendor = useDashboardFilterStore(state => state.selectedVendor);
  const navigate = useNavigate();
  const { t } = useLanguage();

  const stats = useMemo(() => {
    const filteredList = selectedVendor === 'all'
      ? pqpList
      : pqpList.filter(item => item.vendor === selectedVendor);

    const total = filteredList.length;
    const approved = filteredList.filter(item => {
      const status = (item.status || '').toLowerCase();
      return status === 'approved';
    }).length;
    const reject = filteredList.filter(item => {
      const status = (item.status || '').toLowerCase();
      return status === 'reject';
    }).length;
    const reviseResubmit = filteredList.filter(item => {
      const status = (item.status || '').toLowerCase();
      return status === 'revise & resubmit';
    }).length;
    const notSubmit = filteredList.filter(item => {
      const status = (item.status || '').toLowerCase();
      return status === 'not submit';
    }).length;
    const underReview = filteredList.filter(item => {
      const status = (item.status || '').toLowerCase();
      return status === 'under review';
    }).length;

    const approvedPercent = total > 0 ? Math.round((approved / total) * 100) : 0;
    const rejectPercent = total > 0 ? Math.round((reject / total) * 100) : 0;
    const reviseResubmitPercent = total > 0 ? Math.round((reviseResubmit / total) * 100) : 0;
    const notSubmitPercent = total > 0 ? Math.round((notSubmit / total) * 100) : 0;
    const underReviewPercent = total > 0 ? Math.round((underReview / total) * 100) : 0;
    const maturity = total > 0 ? Math.round((approved / total) * 100) : 0;

    return {
      total,
      approved,
      reject,
      reviseResubmit,
      notSubmit,
      underReview,
      approvedPercent,
      rejectPercent,
      reviseResubmitPercent,
      notSubmitPercent,
      underReviewPercent,
      maturity,
    };
  }, [pqpList, selectedVendor]);

  return (
    <div className={styles.pqpStatsCard}>
      <div className={styles.pqpStatsContent}>
        <div className={styles.pqpStatsRow}>
          <span className={styles.pqpStatsLabel}>{t('dashboard.pqpTotal') || 'PQP Total'}</span>
          <span className={styles.pqpStatsValue}>{stats.total}</span>
        </div>
        <div className={styles.pqpStatsRow}>
          <span className={styles.pqpStatsLabel}>{t('status.approved') || 'Approved'}</span>
          <span className={styles.pqpStatsValue} style={{ color: '#1e293b', fontSize: '18px', fontWeight: '600' }}>
            {stats.approved} ({stats.approvedPercent}%)
          </span>
        </div>
        <div className={styles.pqpStatsRow}>
          <span className={styles.pqpStatsLabel}>{t('pqp.status.underReview') || 'Under Review'}</span>
          <span className={styles.pqpStatsValue} style={{ color: '#f59e0b', fontSize: '18px', fontWeight: '600' }}>
            {stats.underReview} ({stats.underReviewPercent}%)
          </span>
        </div>
        <div className={styles.pqpStatsRow}>
          <span className={styles.pqpStatsLabel}>{t('pqp.status.notSubmit') || 'Not Submit'}</span>
          <span className={styles.pqpStatsValue} style={{ color: '#64748b', fontSize: '18px', fontWeight: '600' }}>
            {stats.notSubmit} ({stats.notSubmitPercent}%)
          </span>
        </div>
        <div className={styles.pqpStatsRow}>
          <span className={styles.pqpStatsLabel}>{t('status.reject') || 'Reject'}</span>
          <span className={styles.pqpStatsValue} style={{ color: stats.reject > 0 ? '#dc2626' : '#1e293b', fontSize: '18px', fontWeight: '600' }}>
            {stats.reject} ({stats.rejectPercent}%)
          </span>
        </div>
        <div className={styles.pqpStatsRow}>
          <span className={styles.pqpStatsLabel}>{t('pqp.status.reviseResubmit') || 'Revise & Resubmit'}</span>
          <span className={styles.pqpStatsValue} style={{ color: stats.reviseResubmit > 0 ? '#ea580c' : '#1e293b', fontSize: '18px', fontWeight: '600' }}>
            {stats.reviseResubmit} ({stats.reviseResubmitPercent}%)
          </span>
        </div>
      </div>
      <button className={styles.pqpStatsButton} onClick={() => navigate('/pqp')}>
        {t('common.viewDetails') || 'View Details ->'}
      </button>
    </div>
  );
};

export default PQPStatsCard;
