import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { usePQPStore } from '../../store/pqpStore';
import { useITPStore } from '../../store/itpStore';
import { useOBSStore } from '../../store/obsStore';
import { useNCRStore } from '../../store/ncrStore';
import styles from './KPI.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns, KPIItem } from './columns';

const VENDOR_COLORS = [
  '#3b82f6', '#f97316', '#6b7280', '#eab308', '#22d3ee', '#10b981',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
];

function parseMonth(dateStr: string | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const DEFAULT_WEIGHTS = { pqp: 0.25, itp: 0.25, obs: 0.25, ncr: 0.25 };

const KPI: React.FC = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { getActiveContractors } = useContractorsStore();
  const pqpList = usePQPStore(state => state.pqpList);
  const itpList = useITPStore(state => state.itpList);
  const obsList = useOBSStore(state => state.obsList);
  const ncrList = useNCRStore(state => state.ncrList);

  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [showWeights, setShowWeights] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<string>('all');

  const { chartData, vendorKeys, sortedMonths, vendorRates } = useMemo(() => {
    const filterByVendor = <T extends { vendor?: string }>(list: T[]): T[] => {
      if (selectedVendor === 'all') return list;
      return list.filter((item) => (item.vendor || '').trim() === selectedVendor);
    };
    const filteredPqp = filterByVendor(pqpList);
    const filteredItp = filterByVendor(itpList);
    const filteredObs = filterByVendor(obsList);
    const filteredNcr = filterByVendor(ncrList);

    const totalW = weights.pqp + weights.itp + weights.obs + weights.ncr;
    const scale = totalW > 0 ? 1 / totalW : 1;
    const w = {
      pqp: weights.pqp * scale,
      itp: weights.itp * scale,
      obs: weights.obs * scale,
      ncr: weights.ncr * scale,
    };

    const getVendor = (item: { vendor?: string }) => (item.vendor || 'Unknown').trim() || 'Unknown';

    const pqpByVendorMonth: Record<string, Record<string, { approved: number; total: number }>> = {};
    filteredPqp.forEach((item) => {
      const month = parseMonth(item.updatedAt || item.createdAt);
      const vendor = getVendor(item);
      if (!month) return;
      if (!pqpByVendorMonth[vendor]) pqpByVendorMonth[vendor] = {};
      if (!pqpByVendorMonth[vendor][month]) pqpByVendorMonth[vendor][month] = { approved: 0, total: 0 };
      pqpByVendorMonth[vendor][month].total++;
      if ((item.status || '').toLowerCase() === 'approved') pqpByVendorMonth[vendor][month].approved++;
    });

    const itpByVendorMonth: Record<string, Record<string, { closed: number; total: number }>> = {};
    filteredItp.forEach((item) => {
      const month = parseMonth(item.submissionDate);
      const vendor = getVendor(item);
      if (!month) return;
      if (!itpByVendorMonth[vendor]) itpByVendorMonth[vendor] = {};
      if (!itpByVendorMonth[vendor][month]) itpByVendorMonth[vendor][month] = { closed: 0, total: 0 };
      itpByVendorMonth[vendor][month].total++;
      const s = (item.status || '').toLowerCase();
      if (s === 'approved' || s === 'approved with comments' || s === 'submitted') itpByVendorMonth[vendor][month].closed++;
    });

    const obsByVendorMonth: Record<string, Record<string, { closed: number; total: number }>> = {};
    filteredObs.forEach((item) => {
      const month = parseMonth(item.closeoutDate || item.raiseDate);
      const vendor = getVendor(item);
      if (!month) return;
      if (!obsByVendorMonth[vendor]) obsByVendorMonth[vendor] = {};
      if (!obsByVendorMonth[vendor][month]) obsByVendorMonth[vendor][month] = { closed: 0, total: 0 };
      obsByVendorMonth[vendor][month].total++;
      if ((item.status || '').toLowerCase() === 'closed') obsByVendorMonth[vendor][month].closed++;
    });

    const ncrByVendorMonth: Record<string, Record<string, { closed: number; total: number }>> = {};
    filteredNcr.forEach((item) => {
      const month = parseMonth(item.closeoutDate || item.raiseDate);
      const vendor = getVendor(item);
      if (!month) return;
      if (!ncrByVendorMonth[vendor]) ncrByVendorMonth[vendor] = {};
      if (!ncrByVendorMonth[vendor][month]) ncrByVendorMonth[vendor][month] = { closed: 0, total: 0 };
      ncrByVendorMonth[vendor][month].total++;
      if ((item.status || '').toLowerCase() === 'closed') ncrByVendorMonth[vendor][month].closed++;
    });

    const allMonths = new Set<string>();
    [pqpByVendorMonth, itpByVendorMonth, obsByVendorMonth, ncrByVendorMonth].forEach((byVendor) => {
      Object.values(byVendor).forEach((byMonth) => {
        Object.keys(byMonth).forEach((m) => allMonths.add(m));
      });
    });
    const vendors = new Set<string>();
    [pqpByVendorMonth, itpByVendorMonth, obsByVendorMonth, ncrByVendorMonth].forEach((byVendor) => {
      Object.keys(byVendor).forEach((v) => vendors.add(v));
    });
    const sortedMonths = Array.from(allMonths).sort();
    const vendorList = Array.from(vendors).sort();

    const data = sortedMonths.map((month) => {
      const row: Record<string, string | number | null> = { month };
      vendorList.forEach((vendor) => {
        const pqpR = pqpByVendorMonth[vendor]?.[month];
        const pqpRate = pqpR && pqpR.total > 0 ? Math.round((pqpR.approved / pqpR.total) * 100) : null;
        const itpR = itpByVendorMonth[vendor]?.[month];
        const itpRate = itpR && itpR.total > 0 ? Math.round((itpR.closed / itpR.total) * 100) : null;
        const obsR = obsByVendorMonth[vendor]?.[month];
        const obsRate = obsR && obsR.total > 0 ? Math.round((obsR.closed / obsR.total) * 100) : null;
        const ncrR = ncrByVendorMonth[vendor]?.[month];
        const ncrRate = ncrR && ncrR.total > 0 ? Math.round((ncrR.closed / ncrR.total) * 100) : null;

        const count = [pqpRate, itpRate, obsRate, ncrRate].filter((r) => r !== null).length;
        const kpi =
          count === 0
            ? null
            : Math.round(
              (w.pqp * (pqpRate ?? 0) + w.itp * (itpRate ?? 0) + w.obs * (obsRate ?? 0) + w.ncr * (ncrRate ?? 0)) * 100
            ) / 100;
        row[vendor] = kpi;
      });
      return row;
    });

    const latestMonth = sortedMonths.length > 0 ? sortedMonths[sortedMonths.length - 1] : null;
    const vendorRates: Record<string, { obsPct: number | null; ncrPct: number | null }> = {};
    vendorList.forEach((v) => {
      const obsR = latestMonth ? obsByVendorMonth[v]?.[latestMonth] : null;
      const ncrR = latestMonth ? ncrByVendorMonth[v]?.[latestMonth] : null;
      vendorRates[v] = {
        obsPct: obsR && obsR.total > 0 ? Math.round((obsR.closed / obsR.total) * 100) : null,
        ncrPct: ncrR && ncrR.total > 0 ? Math.round((ncrR.closed / ncrR.total) * 100) : null,
      };
    });

    return { chartData: data, vendorKeys: vendorList, sortedMonths, vendorRates };
  }, [pqpList, itpList, obsList, ncrList, weights, selectedVendor]);

  const handleWeightChange = (key: 'pqp' | 'itp' | 'obs' | 'ncr', value: number) => {
    const v = Math.max(0, Math.min(100, value)) / 100;
    setWeights((prev) => ({ ...prev, [key]: v }));
  };

  const contractors = getActiveContractors();
  const tableRows: KPIItem[] = useMemo(() => {
    return vendorKeys.map((vendor, idx) => {
      const lastMonthVal = chartData.length >= 2 ? chartData[chartData.length - 2][vendor] : null;
      const thisMonthVal = chartData.length >= 1 ? chartData[chartData.length - 1][vendor] : null;
      const lastNum = lastMonthVal != null ? Number(lastMonthVal) : null;
      const thisNum = thisMonthVal != null ? Number(thisMonthVal) : null;
      const variance = lastNum != null && thisNum != null ? thisNum - lastNum : (thisNum != null ? thisNum : 0);
      const scope = contractors.find((c) => c.name === vendor)?.scope || '—';
      const monthly: Record<string, number | null> = {};
      sortedMonths.forEach((m) => {
        const row = chartData.find((r) => r.month === m);
        const val = row && row[vendor] != null ? Number(row[vendor]) : null;
        monthly[m] = val;
      });
      return {
        index: idx + 1,
        vendor,
        scope,
        obsPct: vendorRates[vendor]?.obsPct ?? null,
        ncrPct: vendorRates[vendor]?.ncrPct ?? null,
        lastMonth: lastNum,
        thisMonth: thisNum,
        variance,
        trend: variance > 0 ? 'up' : variance < 0 ? 'down' : 'flat',
        monthly,
      };
    });
  }, [chartData, vendorKeys, sortedMonths, vendorRates, contractors]);

  /* Search Logic */
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredTableRows = useMemo(() => {
    if (!searchQuery.trim()) return tableRows;
    const query = searchQuery.toLowerCase();
    return tableRows.filter(row =>
      row.vendor.toLowerCase().includes(query) ||
      (row.scope && row.scope.toLowerCase().includes(query))
    );
  }, [tableRows, searchQuery]);


  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/')}>
            ← {t('common.back') || 'Back'}
          </button>
          <h1 className={styles.title}>
            {t('kpi.title')}
          </h1>
        </div>
        <div className={styles.headerRight}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('common.search') || "Search..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <label className={styles.vendorLabel}>
            {t('common.contractor')}
            <select
              className={styles.vendorSelect}
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
            >
              <option value="all">{t('common.allContractors')}</option>
              {getActiveContractors().map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className={styles.subtitle}>
        {t('kpi.subtitle')}
      </p>

      <div className={styles.weightSection}>
        <button
          type="button"
          className={styles.weightToggle}
          onClick={() => setShowWeights(!showWeights)}
        >
          {t('kpi.weights')}
          {showWeights ? ' ▼' : ' ▶'}
        </button>
        {showWeights && (
          <div className={styles.weightGrid}>
            <label>
              <span>PQP</span>
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(weights.pqp * 100)}
                onChange={(e) => handleWeightChange('pqp', Number(e.target.value))}
              />
              %
            </label>
            <label>
              <span>ITP</span>
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(weights.itp * 100)}
                onChange={(e) => handleWeightChange('itp', Number(e.target.value))}
              />
              %
            </label>
            <label>
              <span>OBS</span>
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(weights.obs * 100)}
                onChange={(e) => handleWeightChange('obs', Number(e.target.value))}
              />
              %
            </label>
            <label>
              <span>NCR</span>
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(weights.ncr * 100)}
                onChange={(e) => handleWeightChange('ncr', Number(e.target.value))}
              />
              %
            </label>
          </div>
        )}
      </div>

      <div className={styles.chartSection}>
        <h2 className={styles.chartTitle}>{t('kpi.trendTitle')}</h2>
        <div className={styles.chartWrapper}>
          {chartData.length === 0 ? (
            <p className={styles.noData}>
              {t('kpi.noData')}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  interval={0}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  tickFormatter={(v) => `${v}%`}
                  label={{
                    value: language === 'en' ? 'KPI %' : 'KPI %',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fill: '#9ca3af' },
                  }}
                />
                <Tooltip
                  formatter={(value: number | string | null) => (value == null ? '—' : `${value}%`)}
                  labelFormatter={(label) => (`${t('kpi.month')}: ${label}`)}
                />
                <Legend />
                {vendorKeys.map((vendor, i) => (
                  <Line
                    key={vendor}
                    type="monotone"
                    dataKey={vendor}
                    name={vendor}
                    stroke={VENDOR_COLORS[i % VENDOR_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  >
                    <LabelList
                      position="top"
                      formatter={(v: number | string | null) => (v == null ? '' : `${v}%`)}
                      style={{ fontSize: 11, fill: '#e5e7eb' }}
                    />
                  </Line>
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* KPI 表格：放在趨勢圖之下 */}
      <div className={styles.tableWrapper}>
        <DataTable
          title={t('kpi.tableTitle')}
          actions={
            <label className={styles.vendorLabel}>
              {t('common.contractor')}
              <select
                className={styles.vendorSelect}
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
              >
                <option value="all">{t('common.allContractors')}</option>
                {getActiveContractors().map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          }
          columns={useMemo(() => createColumns(sortedMonths, t, language), [sortedMonths, t, language])}
          data={filteredTableRows}
          searchKey=""
          getRowId={(row) => row.vendor}
        />
      </div>
    </div>
  );
};

export default KPI;
