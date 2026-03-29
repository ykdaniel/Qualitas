import React from 'react';
import styles from './StatItem.module.css';

interface StatItemProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconColorClass: string; 
  style?: React.CSSProperties;
}

export const StatItem: React.FC<StatItemProps> = ({
  label,
  value,
  icon,
  iconColorClass,
  style,
}) => {
  return (
    <div className={styles.statItem} style={style}>
      <div className={`${styles.statIcon} ${iconColorClass}`}>
        {icon}
      </div>
      <div className={styles.statContent}>
        <div className={styles.statLabel}>{label}</div>
        <div className={styles.statValue}>{value}</div>
      </div>
    </div>
  );
};
