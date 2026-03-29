import React from 'react';
import AuditStatusIcon from './AuditStatusIcon';
import styles from './ScheduleMatrix.module.css';

interface MatrixDate {
  date: Date;
  isToday: boolean;
  isWeekend: boolean;
  dayLabel: string;
  dateLabel: string;
}

interface Contractor {
  id: string;
  name: string;
}

interface ScheduleMatrixProps {
  matrixDates: MatrixDate[];
  vendors: Contractor[];
  getAuditForMatrix: (vendorName: string, date: Date) => any;
  viewDate: Date;
  onChangeMonth: (offset: number) => void;
  onSetToday: () => void;
  onEditAudit: (id: string) => void;
  loading: boolean;
  t: (key: string) => string;
}

const ScheduleMatrix: React.FC<ScheduleMatrixProps> = ({
  matrixDates,
  vendors,
  getAuditForMatrix,
  viewDate,
  onChangeMonth,
  onSetToday,
  onEditAudit,
  loading,
  t
}) => {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.headerTitleGroup}>
          <h2 className={styles.panelTitle}>{t('audit.schedule')}</h2>
          <div className={styles.navControls}>
            <button className={styles.navBtn} onClick={() => onChangeMonth(-1)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <button className={styles.todayBtn} onClick={onSetToday}>{t('common.today')}</button>
            <button className={styles.navBtn} onClick={() => onChangeMonth(1)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>
        <div className={styles.monthDisplay}>
          {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </div>
      </div>

      <div className={styles.matrixContainer}>
        {loading ? (
          <div className={styles.skeletonGrid}>
            <div className={styles.skeletonPulse} />
            <div className={styles.skeletonPulse} />
            <div className={styles.skeletonPulse} />
          </div>
        ) : matrixDates.length === 0 ? (
          <div className={styles.emptyState}>
            <svg className={styles.emptyIcon} width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
              <line x1="16" x2="16" y1="2" y2="6"/>
              <line x1="8" x2="8" y1="2" y2="6"/>
              <line x1="3" x2="21" y1="10" y2="10"/>
              <path d="m9 16 2 2 4-4"/>
            </svg>
            <h3>No Scheduled Audits</h3>
            <p>Select a different month or clear filters.</p>
          </div>
        ) : (
          <div className={styles.matrixScroll}>
            <table className={styles.matrixTable}>
              <thead>
                <tr>
                  <th className={`${styles.matrixHeaderCell} ${styles.indexCorner}`}>#</th>
                  <th className={`${styles.matrixHeaderCell} ${styles.vendorCorner}`}>
                    {t('common.contractor')}
                  </th>
                  {matrixDates.map((d, i) => (
                    <th key={i} className={`${styles.matrixHeaderCell} ${d.isToday ? styles.todayCol : ''}`}>
                      <span className={styles.dayLabel}>{d.dayLabel}</span>
                      <span className={styles.dateLabel}>{d.dateLabel}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor, vIdx) => (
                  <tr key={vendor.id} className={styles.matrixRow}>
                    <td className={styles.indexCell}>{vIdx + 1}</td>
                    <td className={styles.vendorCell}>{vendor.name}</td>
                    {matrixDates.map((d, i) => {
                      const audit = getAuditForMatrix(vendor.name, d.date);
                      return (
                        <td
                          key={i}
                          className={`
                            ${styles.matrixCell} 
                            ${d.isToday ? styles.todayCell : ''} 
                            ${d.isWeekend ? styles.weekendCell : ''}
                          `}
                        >
                          {audit && (
                            <div className={styles.iconContainer}>
                              <AuditStatusIcon 
                                status={audit.status} 
                                auditNo={audit.auditNo}
                                title={audit.title}
                                onClick={() => onEditAudit(audit.id)}
                              />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleMatrix;
