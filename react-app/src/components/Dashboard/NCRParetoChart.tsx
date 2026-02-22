import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line, LabelList } from 'recharts';
import React, { useMemo } from 'react';
import { useNCRStore } from '../../store/ncrStore';
import { useDashboardFilter } from '../../context/DashboardFilterContext';
import styles from './Dashboard.module.css';

const NCRParetoChart: React.FC = React.memo(() => {
  const ncrList = useNCRStore(state => state.ncrList);
  const { selectedVendor } = useDashboardFilter();

  // 计算按承包商分组的NCR统计数据
  const paretoData = useMemo(() => {
    // 根据选中的厂商过滤数据
    const filteredList = selectedVendor === 'all'
      ? ncrList
      : ncrList.filter(item => item.vendor === selectedVendor);

    // 按承包商分组统计
    const contractorStats: Record<string, { total: number; open: number; closed: number }> = {};

    filteredList.forEach(ncr => {
      const contractor = ncr.vendor || 'Unknown';
      if (!contractorStats[contractor]) {
        contractorStats[contractor] = { total: 0, open: 0, closed: 0 };
      }
      contractorStats[contractor].total++;
      const status = (ncr.status || '').toLowerCase();
      if (status === 'closed') {
        contractorStats[contractor].closed++;
      } else {
        contractorStats[contractor].open++;
      }
    });

    // 转换为数组并按总数排序（从高到低）
    const sortedData = Object.entries(contractorStats)
      .map(([contractor, stats]) => ({
        contractor,
        total: stats.total,
        open: stats.open,
        closed: stats.closed,
      }))
      .sort((a, b) => b.total - a.total);

    // 计算总NCR数
    const totalNCRs = sortedData.reduce((sum, item) => sum + item.total, 0);

    // 计算累积百分比
    let cumulative = 0;
    const dataWithCumulative = sortedData.map(item => {
      cumulative += item.total;
      const cumulativePercent = totalNCRs > 0 ? Math.round((cumulative / totalNCRs) * 100) : 0;
      return {
        ...item,
        cumulativePercent,
      };
    });

    return dataWithCumulative;
  }, [ncrList, selectedVendor]);

  return (
    <div className={styles.paretoChartContainer}>
      <h3 className={styles.paretoTitle}>NCR Status</h3>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={paretoData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="contractor"
            angle={-45}
            textAnchor="end"
            height={80}
            interval={0}
            dy={10}
          />
          <YAxis
            yAxisId="left"
            label={{ value: 'NCR Count', angle: -90, position: 'insideLeft' }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            label={{ value: 'Cumulative %', angle: 90, position: 'insideRight' }}
          />
          <Tooltip
            formatter={(value: any, name: string) => {
              if (name === 'cumulativePercent') {
                return [`${value}%`, 'Cumulative %'];
              }
              return [value, name];
            }}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="closed" stackId="a" fill="#10b981" name="Closed">
            <LabelList
              dataKey="closed"
              position="inside"
              formatter={(value: number) => value > 0 ? value : ''}
              style={{
                fill: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                textAnchor: 'middle',
                dominantBaseline: 'middle'
              }}
            />
          </Bar>
          <Bar yAxisId="left" dataKey="open" stackId="a" fill="#f59e0b" name="Open">
            <LabelList
              dataKey="open"
              position="inside"
              formatter={(value: number) => value > 0 ? value : ''}
              style={{
                fill: '#1f2937',
                fontSize: 12,
                fontWeight: 600,
                textAnchor: 'middle',
                dominantBaseline: 'middle'
              }}
            />
          </Bar>
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulativePercent"
            stroke="#fbbf24"
            strokeWidth={2}
            dot={{ fill: '#fbbf24', r: 4 }}
            name="Cumulative %"
          >
            <LabelList
              dataKey="cumulativePercent"
              position="top"
              formatter={(value: number) => `${value}%`}
              style={{ fill: '#fbbf24', fontSize: 12, fontWeight: 600 }}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});

export default NCRParetoChart;
