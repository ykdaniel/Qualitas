import React from 'react';
import styles from './Dashboard.module.css';

interface KPIMetric {
  label: string;
  value: string | number;
  color?: string;
  isPrimary?: boolean;
}

interface KPICardProps {
  metrics: KPIMetric[];
  onViewDetails: () => void;
  viewDetailsText: string;
  onClick: () => void;
  accentColor?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  metrics,
  onViewDetails,
  viewDetailsText,
  onClick,
  accentColor = '#6366f1',
}) => {
  return (
    <div
      className={styles.kpiCard}
      onClick={onClick}
      style={{ '--card-accent': accentColor } as React.CSSProperties}
    >
      <div className={styles.kpiCardContent}>
        {metrics.map((metric, index) => (
          <div key={index} className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>{metric.label}</span>
            <span
              className={styles.kpiValue}
              style={{
                color: metric.color || '#1e293b',
                fontSize: metric.isPrimary ? '22px' : '17px',
                fontWeight: metric.isPrimary ? '700' : '600',
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
