import { useOBS } from '../../context/OBSContext';
import { useDashboardFilter } from '../../context/DashboardFilterContext';
import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import styles from './Dashboard.module.css';

const OBSStatsCard: React.FC = () => {
  const { obsList } = useOBS();
  const { selectedVendor } = useDashboardFilter();

  const stats = useMemo(() => {
    const filteredList = selectedVendor === 'all' 
      ? obsList 
      : obsList.filter(item => item.vendor === selectedVendor);
    
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
  }, [obsList, selectedVendor]);

  // 圆环图数据
  const pieData = useMemo(() => [
    { name: 'Open', value: stats.open, color: '#f59e0b' },
    { name: 'Closed', value: stats.closed, color: '#10b981' },
  ], [stats.open, stats.closed]);

  return (
    <div className={styles.obsStatsCard}>
      <div className={styles.obsStatsContent}>
        <div className={styles.obsStatsRow}>
          <span className={styles.obsStatsLabel}>Total OBS</span>
          <span className={styles.obsStatsValue} style={{ color: '#3b82f6' }}>{stats.total}</span>
        </div>
        <div className={styles.obsStatsRow}>
          <span className={styles.obsStatsLabel}>Open</span>
          <span className={styles.obsStatsValue} style={{ color: '#1f2937', fontSize: '24px' }}>
            {stats.open} ({stats.openPercent}%)
          </span>
        </div>
        <div className={styles.obsStatsRow}>
          <span className={styles.obsStatsLabel}>Closed</span>
          <span className={styles.obsStatsValue} style={{ color: '#10b981', fontSize: '24px' }}>
            {stats.closed} ({stats.closedPercent}%)
          </span>
        </div>
        
        {/* Open/Closed 圆环图 */}
        <div className={styles.obsPieChartContainer}>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={83}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ value, percent }) => `${value}, ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          {/* 自定义图例 */}
          <div className={styles.obsChartLegend}>
            {pieData.map((entry, index) => (
              <div key={index} className={styles.legendItem}>
                <div className={styles.legendColor} style={{ backgroundColor: entry.color }}></div>
                <span className={styles.legendText}>{entry.name}: {entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OBSStatsCard;
