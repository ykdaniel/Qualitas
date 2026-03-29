import React, { useMemo } from 'react';
import styles from './VendorStatsPanel.module.css';

interface Contractor {
  id: string;
  name: string;
}

interface VendorStatsPanelProps {
  stats: Record<string, number>;
  maxAudits: number;
  activeContractors: Contractor[];
  selectedVendorFilter: string | null;
  onSelectVendor: (vendor: string | null) => void;
  totalAudits: number;
  t: (key: string) => string;
}

const VendorStatsPanel: React.FC<VendorStatsPanelProps> = ({
  stats,
  maxAudits,
  activeContractors,
  selectedVendorFilter,
  onSelectVendor,
  totalAudits,
  t
}) => {
  // Only show vendors that actually have audits
  const vendorsWithAudits = useMemo(() => {
    return activeContractors.filter(vendor => (stats[vendor.name] || 0) > 0);
  }, [activeContractors, stats]);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.headerTitleGroup}>
          <h2 className={styles.panelTitle}>{t('common.contractor') || 'Vendors'}</h2>
          <span className={styles.badge}>{totalAudits} {t('audit.total')}</span>
        </div>
        <p className={styles.panelSubtitle}>Filter audits by selecting a vendor</p>
      </div>

      <div className={styles.vendorList}>
        {/* All Vendors Option */}
        <div
          className={`${styles.vendorItem} ${selectedVendorFilter === null ? styles.active : ''}`}
          onClick={() => onSelectVendor(null)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSelectVendor(null);
          }}
        >
          <div className={styles.vendorHeader}>
            <span className={styles.vendorName}>{t('common.all')}</span>
            <span className={styles.auditCount}>{totalAudits}</span>
          </div>
          <div className={styles.chartTrack}>
            <div className={`${styles.chartBar} ${styles.allBar}`} style={{ width: '100%' }}></div>
          </div>
        </div>

        {vendorsWithAudits.map(vendor => {
          const count = stats[vendor.name] || 0;
          const percentage = maxAudits > 0 ? (count / maxAudits) * 100 : 0;
          const isActive = selectedVendorFilter === vendor.name;

          return (
            <div
              key={vendor.id}
              className={`${styles.vendorItem} ${isActive ? styles.active : ''}`}
              onClick={() => onSelectVendor(isActive ? null : vendor.name)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelectVendor(isActive ? null : vendor.name);
              }}
            >
              <div className={styles.vendorHeader}>
                <span className={styles.vendorName}>{vendor.name}</span>
                <span className={styles.auditCount}>{count}</span>
              </div>
              <div className={styles.chartTrack}>
                <div
                  className={styles.chartBar}
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VendorStatsPanel;
