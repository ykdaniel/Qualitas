import React, { useRef, useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import styles from './Dashboard.module.css';

interface ITPGaugeChartProps {
  approved: number;
  total: number;
  maturity: number;
}

const ITPGaugeChart: React.FC<ITPGaugeChartProps> = React.memo(({ approved, maturity }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(160);

  // ResizeObserver: recompute chart height proportional to container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        // height ≈ 40% of width, clamped to [120, 220]
        setChartHeight(Math.max(120, Math.min(Math.round(w * 0.4), 220)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute radii proportional to chartHeight (same ratios as original hardcoded values)
  const outerRadius = Math.round(chartHeight * 0.75);   // 120 / 160 = 0.75
  const innerRadius = Math.round(outerRadius * 0.667);  // 80 / 120 ≈ 0.667

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
      <h3 className={styles.gaugeTitle}>ITP Approved or with comment (Qty &amp; %)</h3>
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

ITPGaugeChart.displayName = 'ITPGaugeChart';
export default ITPGaugeChart;
