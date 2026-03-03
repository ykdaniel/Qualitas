import { useNavigate } from 'react-router-dom';
import { useNCRStore } from '../../store/ncrStore';
import { useNOIStore } from '../../store/noiStore';
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
import NCRStatusPieChart from './NCRStatusPieChart';
import NOITrendChart from './NOITrendChart';
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

  const ncrList = useNCRStore(state => state.ncrList);
  const noiList = useNOIStore(state => state.noiList);
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
              metrics={[
                { label: t('dashboard.pqpMaturity') || 'PQP Maturity', value: `${statistics.pqp.maturity}%`, color: statistics.pqp.maturity >= 50 ? '#10b981' : '#f59e0b' },
                { label: t('common.total') || 'Total', value: statistics.pqp.total, color: '#3b82f6', isLarge: true },
                { label: t('status.reject') || 'Rejected', value: statistics.pqp.reject, color: '#ef4444', isLarge: true },
              ]}
            />
            <KPICard
              onClick={() => navigate('/itp')}
              onViewDetails={() => navigate('/itp')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              metrics={[
                { label: t('dashboard.itpTotal') || 'ITP Total', value: statistics.itp.total, color: '#3b82f6' },
                { label: t('dashboard.submitted') || 'Submitted', value: `${statistics.itp.submitted} (${statistics.itp.submissionRate}%)`, color: '#3b82f6', isLarge: true },
                { label: t('status.approved') || 'Approved', value: `${statistics.itp.approved} (${statistics.itp.approvalRate}%)`, color: '#10b981', isLarge: true },
              ]}
            />
            <KPICard
              onClick={() => navigate('/checklist')}
              onViewDetails={() => navigate('/checklist')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              metrics={[
                { label: t('checklist.title') || 'Checklist', value: statistics.checklist.total, color: '#8b5cf6' },
                { label: t('status.pass') || 'Pass', value: `${statistics.checklist.passed} (${statistics.checklist.passRate}%)`, color: '#10b981', isLarge: true },
                { label: t('status.ongoing') || 'Ongoing', value: statistics.checklist.ongoing, color: '#f59e0b', isLarge: true },
              ]}
            />
            <KPICard
              onClick={() => navigate('/obs')}
              onViewDetails={() => navigate('/obs')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              metrics={[
                { label: t('dashboard.obsTotal') || 'OBS Total', value: statistics.obs.total, color: '#3b82f6' },
                { label: t('dashboard.open') || 'Open', value: `${statistics.obs.open} (${statistics.obs.openRate}%)`, color: '#f59e0b', isLarge: true },
                { label: t('dashboard.closed') || 'Closed', value: `${statistics.obs.closed} (${statistics.obs.closeRate}%)`, color: '#10b981', isLarge: true },
              ]}
            />
            <KPICard
              onClick={() => navigate('/ncr')}
              onViewDetails={() => navigate('/ncr')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              metrics={[
                { label: t('dashboard.ncrTotal') || 'NCR Total', value: statistics.ncr.total, color: '#3b82f6' },
                { label: t('dashboard.open') || 'Open', value: `${statistics.ncr.open} (${statistics.ncr.openRate}%)`, color: '#f59e0b', isLarge: true },
                { label: t('dashboard.closed') || 'Closed', value: `${statistics.ncr.closed} (${statistics.ncr.closeRate}%)`, color: '#10b981', isLarge: true },
              ]}
            />
            <KPICard
              onClick={() => navigate('/noi')}
              onViewDetails={() => navigate('/noi')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              metrics={[
                { label: t('dashboard.noiTotal') || 'NOI Total', value: statistics.noi.total, color: '#3b82f6' },
                { label: t('dashboard.open') || 'Open', value: `${statistics.noi.open} (${statistics.noi.openRate}%)`, color: '#f59e0b', isLarge: true },
                { label: t('dashboard.closed') || 'Closed', value: `${statistics.noi.closed} (${statistics.noi.closeRate}%)`, color: '#10b981', isLarge: true },
              ]}
            />
            <KPICard
              onClick={() => navigate('/itr')}
              onViewDetails={() => navigate('/itr')}
              viewDetailsText={t('common.viewDetails') || 'View Details'}
              metrics={[
                { label: t('dashboard.itrTotal') || 'ITR Total', value: statistics.itr.total, color: '#3b82f6' },
                { label: t('status.approved') || 'Approved', value: `${statistics.itr.approved} (${statistics.itr.approvalRate}%)`, color: '#10b981', isLarge: true },
                { label: t('status.reject') || 'Rejected', value: `${statistics.itr.rejected} (${statistics.itr.total > 0 ? Math.round((statistics.itr.rejected / statistics.itr.total) * 100) : 0}%)`, color: '#ef4444', isLarge: true },
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

      {/* Recharts 互動圖表區域 */}
      <div className={styles.chartSection}>
        <h2 className={styles.sectionTitle}>{t('dashboard.interactiveCharts') || '互動圖表'}</h2>
        <div className={styles.rechartsGrid}>
          <NCRStatusPieChart
            ncrList={ncrList}
            filterByVendor={selectedVendor !== 'all'}
            selectedVendor={selectedVendor}
          />
          <NOITrendChart
            noiList={noiList}
            months={6}
            filterByVendor={selectedVendor !== 'all'}
            selectedVendor={selectedVendor}
          />
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
