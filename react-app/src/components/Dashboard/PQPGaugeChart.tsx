import React, { useRef, useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import styles from './Dashboard.module.css';

interface PQPGaugeChartProps {
  approved: number;
  total: number;
  maturity: number;
}

const PQPGaugeChart: React.FC<PQPGaugeChartProps> = React.memo(({ approved, maturity }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [{ chartHeight, outerRadius, innerRadius }, setDims] = useState({
    chartHeight: 136, outerRadius: 120, innerRadius: 80,
  });

  // ResizeObserver: bound the gauge radius by the available width. A half-gauge
  // spans 2*R horizontally, so if R is tied to height alone (as before) it gets
  // clipped into a "ribbon" and the needle detaches once the column is narrow
  // on smaller laptop screens. Deriving R from width keeps the arc, needle and
  // height proportional and always inside the column.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const outer = Math.max(48, Math.min(Math.floor(w / 2) - 4, 120));
        setDims({
          chartHeight: outer + 16,            // arc radius + room for the pivot dot
          outerRadius: outer,
          innerRadius: Math.round(outer * 0.667),  // 80 / 120 ≈ 0.667
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gaugeData = [
    { name: 'Low',    value: 40, color: '#f59e0b' },
    { name: 'Medium', value: 40, color: '#3b82f6' },
    { name: 'High',   value: 20, color: '#10b981' },
  ];

  // Needle angle calculation (unchanged logic)
  const targetAngle = 180 - (maturity / 100) * 180;
  const needleAngle = 90 - targetAngle;

  const getValueColor = () => {
    if (maturity === 0) return '#9ca3af';
    return '#0f172a';
  };
  const valueColor = getValueColor();

  return (
    <div className={styles.gaugeChartContainer} ref={containerRef}>
      <h3 className={styles.gaugeTitle}>PQP Total (Qty &amp; %)</h3>
      <div className={styles.gaugeWrapper} style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <PieChart>
            <Pie
              data={gaugeData}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={0}
              dataKey="value"
            >
              {gaugeData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Needle — height follows outerRadius instead of hardcoded 120px */}
        <div
          className={styles.gaugeNeedle}
          style={{
            transform: `translateX(-50%) rotate(${needleAngle}deg)`,
            height: outerRadius,
          }}
        >
          <div className={styles.needleLineRed}></div>
        </div>
      </div>

      <div className={styles.gaugeValue}>
        <span className={styles.gaugeNumber} style={{ color: valueColor }}>{approved}</span>
        <span className={styles.gaugeMaturity} style={{ color: valueColor }}>Maturity = {maturity}%</span>
      </div>
    </div>
  );
});

PQPGaugeChart.displayName = 'PQPGaugeChart';
export default PQPGaugeChart;
