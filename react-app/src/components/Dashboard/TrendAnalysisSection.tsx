import React, { useMemo } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { useNCRStore } from '../../store/ncrStore';
import { useNOIStore } from '../../store/noiStore';
import { useOBSStore } from '../../store/obsStore';
import { usePQPStore } from '../../store/pqpStore';
import { useITPStore } from '../../store/itpStore';
import { useChecklistStore } from '../../store/checklistStore';
import { useDashboardFilterStore } from '../../store/dashboardFilterStore';
import { useLanguage } from '../../context/LanguageContext';
import { buildMonthlyData, TREND_MONTHS } from '../../utils/trendMonths';
import { useDashboardModuleStatus, ModuleStatus } from '../../hooks/useDashboardModuleStatus';
import { StaleFlag } from './ModuleStatus';
import styles from './Dashboard.module.css';

const MONTHS = TREND_MONTHS;

interface MiniTrendCardProps {
  title: string;
  data: { month: string; count: number }[];
  color: string;
  dataLabel: string;
  status: ModuleStatus;
  onRetry: () => void;
}

// BACKLOG #37 (2026-09-29): a trend card used to infer "no data" purely from `total === 0`,
// which is exactly the same "loading vs failed vs really zero" ambiguity the key-stats tiles and
// stats cards had. `status` comes from the SAME useDashboardModuleStatus() the rest of the page
// uses, so a module in trouble reads the same way here as everywhere else on the page.
const MiniTrendCard: React.FC<MiniTrendCardProps> = ({ title, data, color, dataLabel, status, onRetry }) => {
  const { t } = useLanguage();
  const total = data.reduce((s, d) => s + d.count, 0);
  const hasData = total > 0;
  const trendEmptyLabel = t('dashboard.trendEmpty', { months: MONTHS });

  if (status === 'loading') {
    return (
      <div className={styles.trendCard}>
        <div className={styles.trendCardHeader}>
          <span className={styles.trendCardTitle}>{title}</span>
        </div>
        <div className={styles.trendCardChart} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className={styles.keyStatsTileSkeleton} style={{ width: 60 }} />
        </div>
      </div>
    );
  }
  if (status === 'error-empty') {
    return (
      <div className={styles.trendCard}>
        <div className={styles.trendCardHeader}>
          <span className={styles.trendCardTitle}>{title}</span>
        </div>
        <div className={styles.trendCardChart} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span className={styles.moduleStatusErrorText}>{t('dashboard.trendLoadError')}</span>
          <button className={styles.moduleStatusRetryButton} onClick={onRetry}>{t('common.retry')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.trendCard}>
      <div className={styles.trendCardHeader}>
        <span className={styles.trendCardTitle}>{title}</span>
        <span className={styles.trendCardTotal} style={{ color }}>{total}</span>
      </div>
      {status === 'error-stale' && <StaleFlag onRetry={onRetry} />}
      <div className={styles.trendCardChart}>
        {hasData ? (
          <ResponsiveContainer width="100%" height={100}>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(184, 148, 90, 0.18)" />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#8b8275' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#8b8275' }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(184, 148, 90, 0.28)', background: '#ffffff' }}
                formatter={(v: number) => [v, dataLabel]}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke={color}
                strokeWidth={2}
                fill={`url(#grad-${color.replace('#', '')})`}
                dot={{ r: 3, fill: color }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className={styles.trendEmptyState}>
            <span>—</span>
            <span>{trendEmptyLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const TrendAnalysisSection: React.FC = () => {
  const { t } = useLanguage();
  const selectedVendor = useDashboardFilterStore(state => state.selectedVendor);
  const moduleStatus = useDashboardModuleStatus();

  const ncrList = useNCRStore(state => state.ncrList);
  const obsList = useOBSStore(state => state.obsList);
  const noiList = useNOIStore(state => state.noiList);
  const pqpList = usePQPStore(state => state.pqpList);
  const itpList = useITPStore(state => state.itpList);
  const checklistRecords = useChecklistStore(state => state.records);

  const ncrData = useMemo(() => buildMonthlyData(ncrList, i => i.raiseDate, selectedVendor), [ncrList, selectedVendor]);
  const obsData = useMemo(() => buildMonthlyData(obsList, i => i.raiseDate, selectedVendor), [obsList, selectedVendor]);
  const noiData = useMemo(() => buildMonthlyData(noiList, i => i.issueDate, selectedVendor), [noiList, selectedVendor]);
  const pqpData = useMemo(() => buildMonthlyData(pqpList, i => i.updatedAt || i.dueDate, selectedVendor), [pqpList, selectedVendor]);
  const itpData = useMemo(() => buildMonthlyData(itpList, i => i.submissionDate, selectedVendor), [itpList, selectedVendor]);
  const checklistData = useMemo(() => buildMonthlyData(checklistRecords, i => i.date, selectedVendor), [checklistRecords, selectedVendor]);

  // Each card's title states its real date basis (verified against the getDate
  // extractors above) instead of a blanket "X Trend" — a monthly count by
  // submission date is not the same fact as one by raise/issue/update date, and
  // "new item count" would be wrong for every one of these except ITP/Checklist.
  const charts: MiniTrendCardProps[] = [
    { title: t('dashboard.trendBasisNcr'), data: ncrData, color: '#ef4444', dataLabel: t('dashboard.ncrTotal') || 'NCR', status: moduleStatus.ncr.status, onRetry: moduleStatus.ncr.retry },
    { title: t('dashboard.trendBasisObs'), data: obsData, color: '#f59e0b', dataLabel: t('dashboard.obsTotal') || 'OBS', status: moduleStatus.obs.status, onRetry: moduleStatus.obs.retry },
    { title: t('dashboard.trendBasisNoi'), data: noiData, color: '#06b6d4', dataLabel: t('dashboard.noiTotal') || 'NOI', status: moduleStatus.noi.status, onRetry: moduleStatus.noi.retry },
    { title: t('dashboard.trendBasisPqp'), data: pqpData, color: '#8b5cf6', dataLabel: t('dashboard.pqpMaturity') || 'PQP', status: moduleStatus.pqp.status, onRetry: moduleStatus.pqp.retry },
    { title: t('dashboard.trendBasisItp'), data: itpData, color: '#3b82f6', dataLabel: t('dashboard.itpTotal') || 'ITP', status: moduleStatus.itp.status, onRetry: moduleStatus.itp.retry },
    { title: t('dashboard.trendBasisChecklist'), data: checklistData, color: '#10b981', dataLabel: t('checklist.title') || 'Checklist', status: moduleStatus.checklist.status, onRetry: moduleStatus.checklist.retry },
  ];

  return (
    <div className={styles.trendAnalysisSection}>
      <div className={styles.trendAnalysisHeader}>
        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
          {t('dashboard.last6MonthsTrend')}
        </h2>
        <span className={styles.trendSubtitle}>{t('dashboard.trendPeriod', { months: MONTHS })}</span>
      </div>
      <div className={styles.trendGrid}>
        {charts.map(chart => (
          <MiniTrendCard key={chart.title} {...chart} />
        ))}
      </div>
    </div>
  );
};

export default TrendAnalysisSection;
