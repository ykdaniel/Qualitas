import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import styles from './Dashboard.module.css';

interface PQPGaugeChartProps {
  approved: number;
  total: number;
  maturity: number;
}

const PQPGaugeChart: React.FC<PQPGaugeChartProps> = React.memo(({ approved, total, maturity }) => {
  // 创建gauge数据 - 使用180度的半圆，分成三段
  // 40% 橙色 (0-40%), 40% 蓝色 (40-80%), 20% 绿色 (80-100%)
  const gaugeData = [
    { name: 'Low', value: 40, color: '#f59e0b' },      // 橙色 (0-40%)
    { name: 'Medium', value: 40, color: '#3b82f6' },  // 蓝色 (40-80%)
    { name: 'High', value: 20, color: '#10b981' },     // 绿色 (80-100%)
  ];

  // 计算指针角度
  // PieChart从180度（左边）开始，到0度（右边）结束
  // 180度对应0%，0度对应100%
  // 指针默认垂直向上（90度），需要旋转到目标位置
  // 目标角度：180 - (maturity / 100) * 180
  // 从90度旋转到目标角度：目标角度 - 90
  // maturity为0%时，目标180度（左边），旋转90度（180-90）
  // maturity为100%时，目标0度（右边），旋转-90度（0-90）
  // maturity为50%时，目标90度（中间），旋转0度（90-90）
  const targetAngle = 180 - (maturity / 100) * 180;
  const needleAngle = 90 - targetAngle;

  // 根据 maturity 值确定数值颜色
  const getValueColor = () => {
    if (maturity === 0) return '#9ca3af'; // 灰色
    if (maturity === 100) return '#10b981'; // 绿色
    if (maturity < 50) return '#f59e0b'; // 橙色（警告色）
    return '#10b981'; // 绿色（50%以上）
  };

  const valueColor = getValueColor();

  return (
    <div className={styles.gaugeChartContainer}>
      <h3 className={styles.gaugeTitle}>PQP Maturity (Qty & %)</h3>
      <div className={styles.gaugeWrapper}>
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={gaugeData}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={80}
              outerRadius={120}
              paddingAngle={0}
              dataKey="value"
            >
              {gaugeData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* 指针 */}
        <div
          className={styles.gaugeNeedle}
          style={{
            transform: `translateX(-50%) rotate(${needleAngle}deg)`,
          }}
        >
          <div className={styles.needleLineRed}></div>
        </div>
      </div>

      {/* 数值显示 - 放在仪表盘下方 */}
      <div className={styles.gaugeValue}>
        <span className={styles.gaugeNumber} style={{ color: valueColor }}>{approved}</span>
        <span className={styles.gaugeMaturity} style={{ color: valueColor }}>Maturity = {maturity}%</span>
      </div>
    </div>
  );
});

export default PQPGaugeChart;
