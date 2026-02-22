import { usePQP } from '../../context/PQPContext';
import { useDashboardFilter } from '../../context/DashboardFilterContext';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Dashboard.module.css';

const PQPStatsCard: React.FC = () => {
  const { pqpList } = usePQP();
  const { selectedVendor } = useDashboardFilter();
  const navigate = useNavigate();

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
    const approvedPercent = total > 0 ? Math.round((approved / total) * 100) : 0;
    const rejectPercent = total > 0 ? Math.round((reject / total) * 100) : 0;
    const maturity = total > 0 ? Math.round((approved / total) * 100) : 0;

    return {
      total,
      approved,
      reject,
      approvedPercent,
      rejectPercent,
      maturity,
    };
  }, [pqpList, selectedVendor]);

  return (
    <div className={styles.pqpStatsCard}>
      <div className={styles.pqpStatsContent}>
        <div className={styles.pqpStatsRow}>
          <span className={styles.pqpStatsLabel}>PQP 總數</span>
          <span className={styles.pqpStatsValue} style={{ color: '#3b82f6' }}>{stats.total}</span>
        </div>
        <div className={styles.pqpStatsRow}>
          <span className={styles.pqpStatsLabel}>Approved</span>
          <span className={styles.pqpStatsValue} style={{ color: '#1f2937', fontSize: '20px' }}>
            {stats.approved} ({stats.approvedPercent}%)
          </span>
        </div>
        <div className={styles.pqpStatsRow}>
          <span className={styles.pqpStatsLabel}>Reject</span>
          <span className={styles.pqpStatsValue} style={{ color: '#10b981', fontSize: '20px' }}>
            {stats.reject} ({stats.rejectPercent}%)
          </span>
        </div>
      </div>
      <button className={styles.pqpStatsButton} onClick={() => navigate('/pqp')}>
        查看詳情 →
      </button>
    </div>
  );
};

export default PQPStatsCard;
