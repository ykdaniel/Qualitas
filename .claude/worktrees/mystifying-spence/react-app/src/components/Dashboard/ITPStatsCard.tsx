import { useITP } from '../../context/ITPContext';
import { useDashboardFilter } from '../../context/DashboardFilterContext';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Dashboard.module.css';

const ITPStatsCard: React.FC = () => {
  const { itpList } = useITP();
  const { selectedVendor } = useDashboardFilter();
  const navigate = useNavigate();

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
          <span className={styles.itpStatsLabel}>ITP 總數</span>
          <span className={styles.itpStatsValue} style={{ color: '#3b82f6' }}>{stats.total}</span>
        </div>
        <div className={styles.itpStatsRow}>
          <span className={styles.itpStatsLabel}>已提交</span>
          <span className={styles.itpStatsValue} style={{ color: '#1e40af', fontSize: '20px' }}>
            {stats.submitted} ({stats.submittedPercent}%)
          </span>
        </div>
        <div className={styles.itpStatsRow}>
          <span className={styles.itpStatsLabel}>已批准</span>
          <span className={styles.itpStatsValue} style={{ color: '#10b981', fontSize: '20px' }}>
            {stats.approved} ({stats.approvedPercent}%)
          </span>
        </div>
      </div>
      <button className={styles.itpStatsButton} onClick={() => navigate('/itp')}>
        查看詳情 →
      </button>
    </div>
  );
};

export default ITPStatsCard;
