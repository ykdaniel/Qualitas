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
import styles from './Dashboard.module.css';

const MONTHS = 6;

// Generic helper: given a list and a date extractor, returns monthly counts for last N months
function buildMonthlyData(
  list: any[],
  getDate: (item: any) => string | undefined,
  vendor: string
) {
  const filtered = vendor === 'all' ? list : list.filter(i => i.vendor === vendor);

  const today = new Date();
  const monthLabels: string[] = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthLabels.push(d.toISOString().slice(0, 7));
  }

  const counts: Record<string, number> = {};
  monthLabels.forEach(m => { counts[m] = 0; });

  filtered.forEach(item => {
    const raw = getDate(item);
    if (raw) {
      const month = raw.slice(0, 7);
      if (counts[month] !== undefined) counts[month]++;
    }
  });

  return monthLabels.map(month => {
    const [year, mon] = month.split('-');
    return {
      month: `${year}/${parseInt(mon)}`,
      count: counts[month] || 0,
    };
  });
}

interface MiniTrendCardProps {
  title: string;
  data: { month: string; count: number }[];
  color: string;
  dataLabel: string;
}

const MiniTrendCard: React.FC<MiniTrendCardProps> = ({ title, data, color, dataLabel }) => {
  const total = data.reduce((s, d) => s + d.count, 0);
  const hasData = total > 0;

  return (
    <div className={styles.trendCard}>
      <div className={styles.trendCardHeader}>
        <span className={styles.trendCardTitle}>{title}</span>
        <span className={styles.trendCardTotal} style={{ color }}>{total}</span>
      </div>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
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
            <span>近 {MONTHS} 個月無資料</span>
          </div>
        )}
      </div>
    </div>
  );
};

const TrendAnalysisSection: React.FC = () => {
  const { t } = useLanguage();
  const selectedVendor = useDashboardFilterStore(state => state.selectedVendor);

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

  const charts: MiniTrendCardProps[] = [
    { title: 'NCR Trend', data: ncrData, color: '#ef4444', dataLabel: t('dashboard.ncrTotal') || 'NCR' },
    { title: 'OBS Trend', data: obsData, color: '#f59e0b', dataLabel: t('dashboard.obsTotal') || 'OBS' },
    { title: 'NOI Trend', data: noiData, color: '#06b6d4', dataLabel: t('dashboard.noiTotal') || 'NOI' },
    { title: 'PQP Trend', data: pqpData, color: '#8b5cf6', dataLabel: t('dashboard.pqpMaturity') || 'PQP' },
    { title: 'ITP Trend', data: itpData, color: '#3b82f6', dataLabel: t('dashboard.itpTotal') || 'ITP' },
    { title: 'Checklist Trend', data: checklistData, color: '#10b981', dataLabel: t('checklist.title') || 'Checklist' },
  ];

  return (
    <div className={styles.trendAnalysisSection}>
      <div className={styles.trendAnalysisHeader}>
        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
          Trend Analysis
        </h2>
        <span className={styles.trendSubtitle}>近 {MONTHS} 個月月度趨勢</span>
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
