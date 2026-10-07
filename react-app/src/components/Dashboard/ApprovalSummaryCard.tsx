import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { ModuleStatus } from '../../hooks/useDashboardModuleStatus';
import { ModuleStatusBox, StaleFlag } from './ModuleStatus';
import styles from './Dashboard.module.css';

interface OtherRow {
  label: string;
  value: number;
  danger?: boolean; // e.g. Reject — kept red, matching the existing PQPStatsCard convention
}

interface ApprovalSummaryCardProps {
  title: string;
  total: number;
  approvedLabel: string;
  approved: number;
  rate: number; // 0-100, meaningless when total === 0 (rendered as "—", not 0%)
  otherRows: OtherRow[];
  viewDetailsPath: string;
  status: ModuleStatus;
  onRetry: () => void;
}

// Replaces the PQP/ITP "stats card + separate gauge" pair — 2026-09-29 Dashboard simplification
// batch. One card, one number for "approved / total", no duplicate display of the same figures
// across a key-stats tile / a stats card / a gauge (the gauge and the now-removed key-stats tiles
// for PQP/ITP are gone; ITPGaugeChart.tsx/PQPGaugeChart.tsx are left in the tree, unused, for now
// — see the handoff for why they were not deleted). The ratio bar is plain, single-colour: no
// Low/Medium/High band thresholds, because none are a confirmed business rule — a bar that implied
// "quality" bands without one would be asserting something nobody signed off on.
const ApprovalSummaryCard: React.FC<ApprovalSummaryCardProps> = ({
  title, total, approvedLabel, approved, rate, otherRows, viewDetailsPath, status, onRetry,
}) => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  if (status === 'loading' || status === 'error-empty') {
    return (
      <div className={styles.approvalSummaryCard}>
        <div className={styles.approvalSummaryTitle}>{title}</div>
        <ModuleStatusBox status={status} onRetry={onRetry} />
      </div>
    );
  }

  const hasData = total > 0;

  return (
    <div className={styles.approvalSummaryCard}>
      <div className={styles.approvalSummaryHeader}>
        <span className={styles.approvalSummaryTitle}>{title}</span>
        <span className={styles.approvalSummaryTotal}>{total}</span>
      </div>

      {status === 'error-stale' && <StaleFlag onRetry={onRetry} />}

      {!hasData ? (
        <div className={styles.approvalSummaryEmpty}>{t('dashboard.noDataYet')}</div>
      ) : (
        <>
          <div className={styles.approvalSummaryRow}>
            <span className={styles.approvalSummaryRowLabel}>{approvedLabel}</span>
            <span className={styles.approvalSummaryRowValue}>{approved} ({rate}%)</span>
          </div>
          <div className={styles.approvalSummaryBarTrack} role="img" aria-label={`${approvedLabel} ${rate}%`}>
            <div className={styles.approvalSummaryBarFill} style={{ width: `${rate}%` }} />
          </div>
          {otherRows.map(row => (
            <div className={styles.approvalSummaryRow} key={row.label}>
              <span className={styles.approvalSummaryRowLabel}>{row.label}</span>
              <span
                className={styles.approvalSummaryRowValue}
                style={row.danger && row.value > 0 ? { color: '#dc2626' } : undefined}
              >
                {row.value}
              </span>
            </div>
          ))}
        </>
      )}

      <button className={styles.approvalSummaryButton} onClick={() => navigate(viewDetailsPath)}>
        {t('common.viewDetails') || 'View Details ->'}
      </button>
    </div>
  );
};

export default ApprovalSummaryCard;
