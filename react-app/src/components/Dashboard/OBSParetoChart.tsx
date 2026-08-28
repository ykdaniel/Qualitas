import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line, LabelList } from 'recharts';
import React, { useMemo } from 'react';
import { useOBSStore } from '../../store/obsStore';
import { useDashboardFilterStore } from '../../store/dashboardFilterStore';
import styles from './Dashboard.module.css';

const OBSParetoChart: React.FC = React.memo(() => {
  const obsList = useOBSStore(state => state.obsList);
  const selectedVendor = useDashboardFilterStore(state => state.selectedVendor);

  // 计算按承包商分组的OBS统计数据
  const paretoData = useMemo(() => {
    // 根据选中的厂商过滤数据
    const filteredList = selectedVendor === 'all'
      ? obsList
      : obsList.filter(item => item.vendor === selectedVendor);

    // 按承包商分组统计
    const contractorStats: Record<string, { total: number; open: number; closed: number }> = {};

    filteredList.forEach(obs => {
      const contractor = obs.vendor || 'Unknown';
      if (!contractorStats[contractor]) {
        contractorStats[contractor] = { total: 0, open: 0, closed: 0 };
      }
      contractorStats[contractor].total++;
      const status = (obs.status || '').toLowerCase();
      if (status === 'closed') {
        contractorStats[contractor].closed++;
      } else if (status !== 'void') {
        // Void OBS count toward the contractor's total but are neither
        // open nor closed — matches OBSStatsCard's own exclusion (the
        // sidebar stat card this chart sits next to), which previously
        // disagreed with this chart on what counts as "open".
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

    // 计算总OBS数
    const totalOBSs = sortedData.reduce((sum, item) => sum + item.total, 0);

    // 计算累积百分比
    const { result: dataWithCumulative } = sortedData.reduce(
      (acc, item) => {
        acc.cumulative += item.total;
        const cumulativePercent = totalOBSs > 0 ? Math.round((acc.cumulative / totalOBSs) * 100) : 0;
        acc.result.push({
          ...item,
          cumulativePercent,
        });
        return acc;
      },
      { cumulative: 0, result: [] as any[] }
    );

    return dataWithCumulative;
  }, [obsList, selectedVendor]);

  // Recharts' "nice tick" rounding can inflate the left axis well past the
  // actual max bar (observed: a max of 2 rendering against a 0-4 axis), and
  // does so inconsistently between otherwise-identical charts. Pass explicit
  // integer ticks so the axis always matches the data exactly.
  const leftAxisMax = Math.max(1, Math.ceil(Math.max(0, ...paretoData.map(d => d.total)) * 1.15));
  const leftAxisTicks = useMemo(
    () => Array.from({ length: leftAxisMax + 1 }, (_, i) => i),
    [leftAxisMax]
  );

  return (
    <div className={styles.paretoChartContainer}>
      <ResponsiveContainer width="100%" height={460}>
        <ComposedChart data={paretoData} margin={{ top: 16, right: 30, left: 20, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="contractor"
            angle={-45}
            textAnchor="end"
            height={120}
            interval={0}
            tickMargin={16}
            tick={{ fill: '#2d2a24', fontSize: 12 }}
          />
          <YAxis
            yAxisId="left"
            allowDecimals={false}
            domain={[0, leftAxisMax]}
            ticks={leftAxisTicks}
            label={{ value: 'OBS Count', angle: -90, position: 'insideLeft' }}
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
          <Legend
            iconType="circle"
            iconSize={10}
            wrapperStyle={{ paddingTop: 12 }}
            formatter={(value) => (
              <span style={{ color: '#2d2a24', fontSize: 13, fontWeight: 600, marginRight: 8 }}>
                {value}
              </span>
            )}
          />
          <Bar yAxisId="left" dataKey="closed" stackId="a" fill="#10b981" name="Closed" maxBarSize={80}>
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
          <Bar yAxisId="left" dataKey="open" stackId="a" fill="#f59e0b" name="Open" maxBarSize={80}>
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
            stroke="#7c3aed"
            strokeWidth={2.5}
            dot={{ fill: '#7c3aed', r: 4 }}
            name="Cumulative %"
          >
            <LabelList
              dataKey="cumulativePercent"
              position="top"
              formatter={(value: number) => `${value}%`}
              style={{ fill: '#7c3aed', fontSize: 12, fontWeight: 700 }}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});

export default OBSParetoChart;
