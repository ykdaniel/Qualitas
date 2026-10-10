import { useNavigate } from 'react-router-dom';
import { useContractorsStore, ContractorOption } from '../../store/contractorsStore';
import { useDashboardFilterStore } from '../../store/dashboardFilterStore';
import { useProjectStore } from '../../store/projectStore';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { useUpcomingTasks } from '../../hooks/useUpcomingTasks';
import { useDashboardModuleStatus } from '../../hooks/useDashboardModuleStatus';
import ApprovalSummaryCard from './ApprovalSummaryCard';
import NCRParetoChart from './NCRParetoChart';
import NCRStatsCard from './NCRStatsCard';
import TrendAnalysisSection from './TrendAnalysisSection';
import OBSParetoChart from './OBSParetoChart';
import OBSStatsCard from './OBSStatsCard';
import { ModuleStatusBox, StaleFlag } from './ModuleStatus';
import MaterialStatsTile from './MaterialStatsTile';
import { useAuth } from '../../context/AuthContext';
import styles from './Dashboard.module.css';
import shellStyles from '../Shared/ModuleShell.module.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const { getActiveContractors } = useContractorsStore();

  return (
    <DashboardContent
      navigate={navigate}
      getActiveContractors={getActiveContractors}
    />
  );
};

const DashboardContent: React.FC<{
  navigate: (path: string) => void;
  getActiveContractors: () => ContractorOption[];
}> = ({ navigate, getActiveContractors }) => {
  const { selectedVendor, setSelectedVendor } = useDashboardFilterStore();
  const { statistics, t } = useDashboardStats(selectedVendor);
  const upcomingTasks = useUpcomingTasks(selectedVendor);
  const currentProject = useProjectStore(s => s.currentProject);
  const { hasPermission } = useAuth();
  // BACKLOG #37 (2026-09-29): one derived status per module (loading / error-empty / error-stale /
  // ok), read straight off each store's own existing `loading`/`error`/list — no new store state,
  // no calculation changed. Replaces the narrower NCR/OBS/NOI-only "failed = unknown, not zero"
  // check (2026-09-20) with the same idea applied consistently to every module this page shows,
  // AND to the sections below (key-stats tile, stats card, gauge, pareto, trend all read the SAME
  // per-module status — see useDashboardModuleStatus.ts for why this also covers a project/scope
  // switch without separate tracking).
  const moduleStatus = useDashboardModuleStatus();
  // Only 'error-empty' goes in this top banner — its wording ("figures are unknown, not zero")
  // would be wrong for 'error-stale', which DOES have real (if possibly outdated) figures on
  // screen; those get their own inline <StaleFlag/> next to the data instead, not this banner.
  const failedModules = (['itp', 'pqp', 'ncr', 'obs', 'noi'] as const)
    .filter(k => moduleStatus[k].status === 'error-empty')
    .map(k => k.toUpperCase())
    .join(' / ');

  // Key-stats tiles read the SAME `statistics` object the pareto sections below use — no separate
  // calculation, just a compact "where things stand right now" summary shown before the detail.
  // PQP/ITP are NOT tiled here (2026-09-29 simplification): their numbers now live in exactly one
  // place, the consolidated ApprovalSummaryCard further down — showing them twice was the
  // duplication this batch removed. NCR/OBS/NOI keep their tile; they were out of that batch's
  // scope and still have their own separate stats-card + pareto section below.
  const keyStatsTiles = [
    { key: 'ncr' as const, label: t('dashboard.ncrTotal'), value: statistics.ncr.total,
      sub: `${t('dashboard.open')} ${statistics.ncr.open} (${statistics.ncr.openRate}%)`, path: '/ncr' },
    { key: 'obs' as const, label: t('dashboard.obsTotal'), value: statistics.obs.total,
      sub: `${t('dashboard.open')} ${statistics.obs.open} (${statistics.obs.openRate}%)`, path: '/obs' },
    { key: 'noi' as const, label: t('dashboard.noiTotal'), value: statistics.noi.total,
      sub: `${t('dashboard.open')} ${statistics.noi.open} (${statistics.noi.openRate}%)`, path: '/noi' },
  ];

  return (
    <div className={shellStyles.container}>
      <p className={styles.subtitle}>
        {t('dashboard.subtitle')}
      </p>

      {/* Scope bar (2026-09-29): states the page's own current project + contractor scope up
          front. The project VALUE is read-only here — the actual selector already lives in the
          app header (Shared/ProjectSelector.tsx) — and the contractor control below is the same
          <select>/store this page always used, just moved up; no second scope mechanism added. */}
      <div className={styles.scopeBar}>
        <span className={styles.scopeBarLabel}>{t('dashboard.scopeLabel')}</span>
        <span className={styles.scopeChip}>
          {currentProject && <span className={styles.scopeChipCode}>{currentProject.code}</span>}
          {currentProject ? currentProject.name : t('project.allProjects')}
        </span>
        <label className={styles.vendorLabel}>
          {t('common.contractor')}
          <select
            className={styles.vendorSelect}
            value={selectedVendor}
            onChange={(e) => setSelectedVendor(e.target.value)}
          >
            <option value="all">{t('common.allContractors')}</option>
            {getActiveContractors().map((contractor) => (
              <option key={contractor.id} value={contractor.name}>
                {contractor.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {failedModules && (
        <div data-load-failed-note role="alert" style={{ margin: '0 0 12px', padding: '10px 14px', borderRadius: 8, border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', fontSize: 13 }}>
          {t('dashboard.loadFailed', { modules: failedModules })}
        </div>
      )}

      {/* Key statistics summary (2026-09-29): current totals, reusing the already-computed
          `statistics` from useDashboardStats — no new calculation. Explicitly labelled "current
          total" so it isn't mistaken for the 6-month trend numbers further down the page. */}
      <div className={styles.keyStatsSection}>
        <div className={styles.keyStatsHeader}>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{t('dashboard.keyStats')}</h2>
          <span className={styles.keyStatsNote}>{t('dashboard.currentTotalNote')}</span>
        </div>
        <div className={styles.keyStatsGrid}>
          {keyStatsTiles.map(tile => {
            const { status, retry } = moduleStatus[tile.key];
            return (
              <div key={tile.key} className={styles.keyStatsTile} onClick={() => navigate(tile.path)}>
                <div className={styles.keyStatsTileLabel}>{tile.label}</div>
                {status === 'loading' ? (
                  <div role="status" aria-live="polite">
                    <div className={styles.keyStatsTileSkeleton} />
                    <span className={styles.moduleStatusText}>{t('common.loading')}</span>
                  </div>
                ) : status === 'error-empty' ? (
                  <>
                    <div className={styles.moduleStatusErrorText}>{t('dashboard.loadError')}</div>
                    <button
                      className={styles.moduleStatusRetryButton}
                      onClick={(e) => { e.stopPropagation(); retry(); }}
                    >
                      {t('common.retry')}
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.keyStatsTileValue}>{tile.value}</div>
                    <div className={styles.keyStatsTileSub}>{tile.sub}</div>
                    {status === 'error-stale' && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <StaleFlag onRetry={retry} />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {/* MATERIAL-SUBMITTAL M6: approved-material register — own loading / error state, separate from `statistics` */}
          {hasPermission('material:view:all') && (
            <MaterialStatsTile selectedVendor={selectedVendor} onOpen={() => navigate('/materials')}
                               loadingText={t('common.loading')} errorText={t('dashboard.loadError')} retryText={t('common.retry')} />
          )}
        </div>
      </div>

      {/* Upcoming Tasks Section — existing due-date reminders */}
      {upcomingTasks.length > 0 && (
        <div className={styles.upcomingSection}>
          <h2 className={styles.sectionTitle}>
            🔔 {t('dashboard.upcomingTasks')}
            <span className={styles.badge}>{upcomingTasks.length}</span>
          </h2>
          <div className={styles.upcomingGrid}>
            {upcomingTasks.map(task => (
              <div key={`${task.type}-${task.id}`} className={styles.upcomingCard} onClick={() => navigate(task.link)}>
                <div className={styles.upcomingBadge}>{task.type}</div>
                <div className={styles.upcomingContent}>
                  <div className={styles.upcomingTitle}>{task.title}</div>
                  <div className={styles.upcomingVenue}>{task.vendor}</div>
                </div>
                <div className={styles.upcomingDate}>
                  <span className={styles.dateLabel}>{t('common.dueDate')}</span>
                  <span className={styles.dateValue}>{task.dueDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 分隔线 */}
      <div className={styles.sectionDivider}></div>

      {/* Trend & detailed analysis — grouped last: trend mini-charts, then the PQP/ITP
          maturity gauges, then the OBS/NCR pareto breakdowns. */}
      <h2 className={styles.sectionTitle}>{t('dashboard.trendDetailSection')}</h2>

      {/* 趨勢分析區域 */}
      <TrendAnalysisSection />

      {/* 分隔线 */}
      <div className={styles.sectionDivider}></div>

      {/* PQP／ITP 核准摘要（2026-09-29 簡化：一個模組一張卡，取代原本摘要磚＋詳細卡＋Gauge 三處
          重複顯示同一組數字；ApprovalSummaryCard 內部已處理 #37 的載入中／失敗／舊資料狀態，不
          需要在這裡再包一層 ModuleStatusBox。） */}
      <div className={styles.chartSection}>
        <div className={styles.dualChartContainer}>
          <div className={styles.singleChartSection}>
            <ApprovalSummaryCard
              title={t('dashboard.pqpTotal')}
              total={statistics.pqp.total}
              approvedLabel={t('status.approved')}
              approved={statistics.pqp.approved}
              rate={statistics.pqp.maturity}
              otherRows={[
                { label: t('status.underReview'), value: statistics.pqp.underReview },
                { label: t('status.reject'), value: statistics.pqp.reject, danger: true },
              ]}
              viewDetailsPath="/pqp"
              status={moduleStatus.pqp.status}
              onRetry={moduleStatus.pqp.retry}
            />
          </div>

          <div className={styles.verticalDivider}></div>

          <div className={styles.singleChartSection}>
            <ApprovalSummaryCard
              title={t('dashboard.itpTotal')}
              total={statistics.itp.total}
              approvedLabel={t('dashboard.itpApprovedLabel')}
              approved={statistics.itp.approved}
              rate={statistics.itp.approvalRate}
              otherRows={[
                { label: t('dashboard.submitted'), value: statistics.itp.submitted },
              ]}
              viewDetailsPath="/itp"
              status={moduleStatus.itp.status}
              onRetry={moduleStatus.itp.retry}
            />
          </div>
        </div>
      </div>

      {/* 分隔线 */}
      <div className={styles.sectionDivider}></div>

      {/* OBS Pareto 分析 */}
      <div className={styles.chartSection}>
        <h2 className={styles.sectionTitle}>{t('dashboard.obsStatusAnalysis')}</h2>
        {(moduleStatus.obs.status === 'loading' || moduleStatus.obs.status === 'error-empty') ? (
          <ModuleStatusBox status={moduleStatus.obs.status} onRetry={moduleStatus.obs.retry} />
        ) : (
          <>
            <div className={styles.obsChartWrapper}>
              <OBSStatsCard />
              <div className={styles.chartContainerFlex}>
                <OBSParetoChart />
              </div>
            </div>
            {moduleStatus.obs.status === 'error-stale' && <StaleFlag onRetry={moduleStatus.obs.retry} />}
          </>
        )}
      </div>

      {/* 分隔线 */}
      <div className={styles.sectionDivider}></div>

      {/* NCR Pareto 分析 */}
      <div className={styles.chartSection}>
        <h2 className={styles.sectionTitle}>{t('dashboard.ncrStatusAnalysis')}</h2>
        {(moduleStatus.ncr.status === 'loading' || moduleStatus.ncr.status === 'error-empty') ? (
          <ModuleStatusBox status={moduleStatus.ncr.status} onRetry={moduleStatus.ncr.retry} />
        ) : (
          <>
            <div className={styles.ncrChartWrapper}>
              <NCRStatsCard />
              <div className={styles.chartContainerFlex}>
                <NCRParetoChart />
              </div>
            </div>
            {moduleStatus.ncr.status === 'error-stale' && <StaleFlag onRetry={moduleStatus.ncr.retry} />}
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
