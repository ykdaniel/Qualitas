import { useNavigate } from 'react-router-dom';
import { useContractorsStore, Contractor } from '../../store/contractorsStore';
import { useDashboardFilterStore } from '../../store/dashboardFilterStore';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { useUpcomingTasks } from '../../hooks/useUpcomingTasks';
import ITPGaugeChart from './ITPGaugeChart';
import ITPStatsCard from './ITPStatsCard';
import PQPGaugeChart from './PQPGaugeChart';
import PQPStatsCard from './PQPStatsCard';
import NCRParetoChart from './NCRParetoChart';
import NCRStatsCard from './NCRStatsCard';
import TrendAnalysisSection from './TrendAnalysisSection';
import OBSParetoChart from './OBSParetoChart';
import OBSStatsCard from './OBSStatsCard';
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
  getActiveContractors: () => Contractor[];
}> = ({ navigate, getActiveContractors }) => {
  const { selectedVendor, setSelectedVendor } = useDashboardFilterStore();
  const { statistics, t } = useDashboardStats(selectedVendor);
  const upcomingTasks = useUpcomingTasks(selectedVendor);
  return (
    <div className={shellStyles.container}>
      <p className={styles.subtitle}>
        {t('dashboard.subtitle')}
      </p>

      <div className={shellStyles.toolbar}>
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

      {/* 趨勢分析區域 */}
      <TrendAnalysisSection />

      {/* 分隔线 */}
      <div className={styles.sectionDivider}></div>

      {/* PQP 和 ITP 成熟度分析（並排） */}
      <div className={styles.chartSection}>
        <div className={styles.dualChartContainer}>
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

          <div className={styles.verticalDivider}></div>

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

      {/* OBS Pareto 分析 */}
      <div className={styles.chartSection}>
        <h2 className={styles.sectionTitle}>{t('dashboard.obsStatusAnalysis')}</h2>
        <div className={styles.obsChartWrapper}>
          <OBSStatsCard />
          <div className={styles.chartContainer}>
            <OBSParetoChart />
          </div>
        </div>
      </div>

      {/* 分隔线 */}
      <div className={styles.sectionDivider}></div>

      {/* NCR Pareto 分析 */}
      <div className={styles.chartSection}>
        <h2 className={styles.sectionTitle}>{t('dashboard.ncrStatusAnalysis')}</h2>
        <div className={styles.ncrChartWrapper}>
          <NCRStatsCard />
          <div className={styles.chartContainer}>
            <NCRParetoChart />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
