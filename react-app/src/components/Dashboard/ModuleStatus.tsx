import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { ModuleStatus as Status } from '../../hooks/useDashboardModuleStatus';
import styles from './Dashboard.module.css';

// Shared placeholder for a whole section (a statscard+gauge column, a statscard+pareto row) when
// there is nothing usable to render yet — 'loading' or 'error-empty'. 'ok' and 'error-stale' both
// render the caller's normal children (error-stale additionally gets <StaleFlag/> next to them);
// this component is only for the two states where the normal content would be misleading.
export const ModuleStatusBox: React.FC<{ status: Status; onRetry: () => void }> = ({ status, onRetry }) => {
  const { t } = useLanguage();
  if (status === 'loading') {
    return (
      <div className={styles.moduleStatusBox} role="status" aria-live="polite">
        <div className={styles.keyStatsTileSkeleton} style={{ width: 80, height: 32 }} />
        <span className={styles.moduleStatusText}>{t('common.loading')}</span>
      </div>
    );
  }
  // error-empty
  return (
    <div className={styles.moduleStatusBox} role="alert">
      <span className={styles.moduleStatusErrorText}>{t('dashboard.loadError')}</span>
      <button className={styles.moduleStatusRetryButton} onClick={onRetry}>{t('common.retry')}</button>
    </div>
  );
};

// Inline flag shown ALONGSIDE already-rendered (stale) data, for the 'error-stale' case: the data
// itself is real (a previous successful load), it is just not current — the retry button re-fetches
// in place, it does not hide the stale data while retrying (loading state will do that on its own
// if the retry itself flips `loading`).
export const StaleFlag: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
  const { t } = useLanguage();
  return (
    <div className={styles.moduleStaleFlag}>
      <span>{t('dashboard.loadErrorStaleNote')}</span>
      <button className={styles.moduleStaleFlagRetry} onClick={onRetry}>{t('common.retry')}</button>
    </div>
  );
};
