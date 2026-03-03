import React from 'react';
import styles from './Dashboard.module.css';

interface DashboardChartSectionProps {
  title: string;
  statsCard?: React.ReactNode;
  chart: React.ReactNode;
  onViewDetails?: () => void;
  viewDetailsText?: string;
  wrapperClassName?: string;
}

export const DashboardChartSection: React.FC<DashboardChartSectionProps> = ({
  title,
  statsCard,
  chart,
  onViewDetails,
  viewDetailsText,
  wrapperClassName,
}) => {
  return (
    <div className={styles.chartSection}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={wrapperClassName}>
        {statsCard}
        <div className={styles.chartContainer}>
          {chart}
        </div>
      </div>
      {onViewDetails && viewDetailsText && (
        <button className={styles.obsSectionButton} onClick={onViewDetails}>
          {viewDetailsText}
        </button>
      )}
    </div>
  );
};
