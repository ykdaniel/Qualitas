import React from 'react';
import styles from './Dashboard.module.css';

interface KPIMetric {
  label: string;
  value: string | number;
  color?: string;
  isLarge?: boolean;
}

interface KPICardProps {
  metrics: KPIMetric[];
  onViewDetails: () => void;
  viewDetailsText: string;
  onClick: () => void;
}

export const KPICard: React.FC<KPICardProps> = ({
  metrics,
  onViewDetails,
  viewDetailsText,
  onClick,
}) => {
  return (
    <div className={styles.kpiCard} onClick={onClick}>
      <div className={styles.kpiCardContent}>
        {metrics.map((metric, index) => (
          <div key={index} className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>{metric.label}</span>
            <span
              className={styles.kpiValue}
              style={{
                color: metric.color || 'inherit',
                fontSize: metric.isLarge ? '20px' : 'inherit',
              }}
            >
              {metric.value}
            </span>
          </div>
        ))}
      </div>
      <button
        className={styles.viewButton}
        onClick={(e) => {
          e.stopPropagation();
          onViewDetails();
        }}
      >
        {viewDetailsText}
      </button>
    </div>
  );
};
