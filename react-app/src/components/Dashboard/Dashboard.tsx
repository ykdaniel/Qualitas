import { useNavigate } from 'react-router-dom';
import { useContractorsStore, Contractor } from '../../store/contractorsStore';
import { useDashboardFilterStore } from '../../store/dashboardFilterStore';
import { useState } from 'react';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { useUpcomingTasks } from '../../hooks/useUpcomingTasks';
import { KPICard } from './KPICard';
import ITPGaugeChart from './ITPGaugeChart';
import ITPStatsCard from './ITPStatsCard';
import PQPGaugeChart from './PQPGaugeChart';
import PQPStatsCard from './PQPStatsCard';
import NCRParetoChart from './NCRParetoChart';
import NCRStatsCard from './NCRStatsCard';
import TrendAnalysisSection from './TrendAnalysisSection';
import OBSParetoChart from './OBSParetoChart';
import OBSStatsCard from './OBSStatsCard';
import { DashboardChartSection } from './DashboardChartSection';
import styles from './Dashboard.module.css';
import { BackButton } from '@/components/ui/BackButton';

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
  getActiveContractors: () => Contractor[];
}> = ({ navigate, getActiveContractors }) => {
  const [kpiCollapsed, setKpiCollapsed] = useState(false);
  const { selectedVendor, setSelectedVendor } = useDashboardFilterStore();
  const { statistics, t } = useDashboardStats(selectedVendor);
  const upcomingTasks = useUpcomingTasks(selectedVendor);
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1 className={styles.title}>{t('dashboard.title')}</h1>
        </div>
        <div className={styles.headerRight}>
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
      </div>

      <p className={styles.subtitle}>
        {t('dashboard.subtitle')}
      </p>

      {/* Upcoming Tasks Section */}
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

      {/* KPI 卡片區域 */}
      <div className={styles.kpiSection}>
        <h2
          className={styles.sectionTitleCollapsible}
          onClick={() => setKpiCollapsed(c => !c)}
          role="button"
          aria-expanded={!kpiCollapsed}
        >
          <span className={styles.sectionTitleChevron}>{kpiCollapsed ? '▶' : '▼'}</span>
          {t('dashboard.kpiOverview')}
        </h2>
        {!kpiCollapsed && (
          <div className={styles.kpiGrid}>
            <KPICard
              onClick={() => navigate('/pqp')}
              onViewDetails={() => navigate('/pqp')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              accentColor="#8b5cf6"
              metrics={[
                { label: t('dashboard.pqpTotal') || 'PQP Total', value: statistics.pqp.total, isPrimary: true },
                { label: t('status.approved') || 'Approved', value: `${statistics.pqp.approved} (${statistics.pqp.maturity}%)` },
                { label: t('status.reject') || 'Rejected', value: statistics.pqp.reject, color: statistics.pqp.reject > 0 ? '#dc2626' : undefined },
              ]}
            />
            <KPICard
              onClick={() => navigate('/itp')}
              onViewDetails={() => navigate('/itp')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              accentColor="#3b82f6"
              metrics={[
                { label: t('dashboard.itpTotal') || 'ITP Total', value: statistics.itp.total, isPrimary: true },
                { label: t('dashboard.submitted') || 'Submitted', value: `${statistics.itp.submitted} (${statistics.itp.submissionRate}%)` },
                { label: t('status.approved') || 'Approved', value: `${statistics.itp.approved} (${statistics.itp.approvalRate}%)` },
              ]}
            />
            <KPICard
              onClick={() => navigate('/checklist')}
              onViewDetails={() => navigate('/checklist')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              accentColor="#10b981"
              metrics={[
                { label: t('dashboard.checklistTotal') || 'Checklist Total', value: statistics.checklist.total, isPrimary: true },
                { label: t('checklist.status.pass') || 'Pass', value: `${statistics.checklist.passed} (${statistics.checklist.passRate}%)` },
                { label: t('checklist.status.ongoing') || 'Ongoing', value: statistics.checklist.ongoing },
              ]}
            />
            <KPICard
              onClick={() => navigate('/obs')}
              onViewDetails={() => navigate('/obs')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              accentColor="#f59e0b"
              metrics={[
                { label: t('dashboard.obsTotal') || 'OBS Total', value: statistics.obs.total, isPrimary: true },
                { label: t('dashboard.open') || 'Open', value: `${statistics.obs.open} (${statistics.obs.openRate}%)` },
                { label: t('dashboard.closed') || 'Closed', value: `${statistics.obs.closed} (${statistics.obs.closeRate}%)` },
              ]}
            />
            <KPICard
              onClick={() => navigate('/ncr')}
              onViewDetails={() => navigate('/ncr')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              accentColor="#ef4444"
              metrics={[
                { label: t('dashboard.ncrTotal') || 'NCR Total', value: statistics.ncr.total, isPrimary: true },
                { label: t('dashboard.open') || 'Open', value: `${statistics.ncr.open} (${statistics.ncr.openRate}%)` },
                { label: t('dashboard.closed') || 'Closed', value: `${statistics.ncr.closed} (${statistics.ncr.closeRate}%)` },
              ]}
            />
            <KPICard
              onClick={() => navigate('/noi')}
              onViewDetails={() => navigate('/noi')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              accentColor="#06b6d4"
              metrics={[
                { label: t('dashboard.noiTotal') || 'NOI Total', value: statistics.noi.total, isPrimary: true },
                { label: t('dashboard.open') || 'Open', value: `${statistics.noi.open} (${statistics.noi.openRate}%)` },
                { label: t('dashboard.closed') || 'Closed', value: `${statistics.noi.closed} (${statistics.noi.closeRate}%)` },
              ]}
            />
            <KPICard
              onClick={() => navigate('/itr')}
              onViewDetails={() => navigate('/itr')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              accentColor="#6366f1"
              metrics={[
                { label: t('dashboard.itrTotal') || 'ITR Total', value: statistics.itr.total, isPrimary: true },
                { label: t('status.approved') || 'Approved', value: `${statistics.itr.approved} (${statistics.itr.approvalRate}%)` },
                { label: t('status.reject') || 'Rejected', value: `${statistics.itr.rejected} (${statistics.itr.total > 0 ? Math.round((statistics.itr.rejected / statistics.itr.total) * 100) : 0}%)`, color: statistics.itr.rejected > 0 ? '#dc2626' : undefined },
              ]}
            />
          </div>
        )}
      </div>

      {/* PQP 和 ITP 趨勢圖表區域 */}
      <div className={styles.chartSection}>
        <div className={styles.dualChartContainer}>
          {/* PQP 成熟度分析 */}
          <div className={styles.singleChartSection}>
            <h2 className={styles.sectionTitle}>{t('dashboard.pqpMaturityAnalysis')}</h2>
            <div className={styles.pqpChartWrapper}>
              <PQPStatsCard />
              <div className={styles.chartContainer}>
                <PQPGaugeChart
                  approved={statistics.pqp.approved}
                  total={statistics.pqp.total}
                  maturity={statistics.pqp.maturity}
                />
              </div>
            </div>
          </div>

          {/* ITP 和 PQP 之间的分隔线 */}
          <div className={styles.verticalDivider}></div>

          {/* ITP 成熟度分析 */}
          <div className={styles.singleChartSection}>
            <h2 className={styles.sectionTitle}>{t('dashboard.itpMaturityAnalysis')}</h2>
            <div className={styles.itpChartWrapper}>
              <ITPStatsCard />
              <div className={styles.chartContainer}>
                <ITPGaugeChart
                  approved={statistics.itp.approved}
                  total={statistics.itp.total}
                  maturity={statistics.itp.approvalRate}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 分隔线 */}
      <div className={styles.sectionDivider}></div>

      {/* OBS Pareto 圖表區域 */}
      <DashboardChartSection
        title={t('dashboard.obsStatusAnalysis')}
        wrapperClassName={styles.obsChartWrapper}
        statsCard={<OBSStatsCard />}
        chart={<OBSParetoChart />}
        onViewDetails={() => navigate('/obs')}
        viewDetailsText={t('common.viewDetails')}
      />

      {/* 分隔线 */}
      <div className={styles.sectionDivider}></div>

      {/* NCR Pareto 圖表區域 */}
      <DashboardChartSection
        title={t('dashboard.ncrStatusAnalysis')}
        wrapperClassName={styles.ncrChartWrapper}
        statsCard={<NCRStatsCard />}
        chart={<NCRParetoChart />}
        onViewDetails={() => navigate('/ncr')}
        viewDetailsText={t('common.viewDetails')}
      />

      {/* 分隔线 */}
      <div className={styles.sectionDivider}></div>

      {/* 趨勢分析區域 */}
      <TrendAnalysisSection />
    </div>
  );
};

export default Dashboard;
