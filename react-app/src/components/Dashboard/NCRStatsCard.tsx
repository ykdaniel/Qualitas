import { useNCRStore } from '../../store/ncrStore';
import { useDashboardFilterStore } from '../../store/dashboardFilterStore';
import { useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import styles from './Dashboard.module.css';

const NCRStatsCard: React.FC = () => {
  const ncrList = useNCRStore(state => state.ncrList);
  const selectedVendor = useDashboardFilterStore(state => state.selectedVendor);
  const { t } = useLanguage();

  const stats = useMemo(() => {
    const filteredList = selectedVendor === 'all'
      ? ncrList
      : ncrList.filter(item => item.vendor === selectedVendor);

    const total = filteredList.length;
    const open = filteredList.filter(item => {
      const status = (item.status || '').toLowerCase();
      return status !== 'closed';
    }).length;
    const closed = filteredList.filter(item => {
      const status = (item.status || '').toLowerCase();
      return status === 'closed';
    }).length;
    const openPercent = total > 0 ? Math.round((open / total) * 100) : 0;
    const closedPercent = total > 0 ? Math.round((closed / total) * 100) : 0;

    return {
      total,
      open,
      closed,
      openPercent,
      closedPercent,
    };
  }, [ncrList, selectedVendor]);

  // 圆环图数据
  const pieData = useMemo(() => [
    { name: 'Open', value: stats.open, color: '#f59e0b' },
    { name: 'Closed', value: stats.closed, color: '#10b981' },
  ], [stats.open, stats.closed]);

  return (
    <div className={styles.ncrStatsCard}>
      <div className={styles.ncrStatsContent}>
        <div className={styles.ncrStatsRow}>
          <span className={styles.ncrStatsLabel}>{t('dashboard.ncrTotal') || 'NCR Total'}</span>
          <span className={styles.ncrStatsValue}>{stats.total}</span>
        </div>
        <div className={styles.ncrStatsRow}>
          <span className={styles.ncrStatsLabel}>{t('status.open') || 'Open'}</span>
          <span className={styles.ncrStatsValue} style={{ color: '#1e293b', fontSize: '20px', fontWeight: '600' }}>
            {stats.open} ({stats.openPercent}%)
          </span>
        </div>
        <div className={styles.ncrStatsRow}>
          <span className={styles.ncrStatsLabel}>{t('status.closed') || 'Closed'}</span>
          <span className={styles.ncrStatsValue} style={{ color: '#1e293b', fontSize: '20px', fontWeight: '600' }}>
            {stats.closed} ({stats.closedPercent}%)
          </span>
        </div>

        {/* Legend dots only — no redundant pie chart in sidebar */}
        <div className={styles.ncrChartLegend} style={{ marginTop: '16px' }}>
          {pieData.map((entry, index) => (
            <div key={index} className={styles.legendItem}>
              <div className={styles.legendColor} style={{ backgroundColor: entry.color }}></div>
              <span className={styles.legendText}>{entry.name}: {entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NCRStatsCard;
