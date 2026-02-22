import React, { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { useLanguage } from '../../context/LanguageContext';
import styles from './Dashboard.module.css';

interface NOIItem {
    id: string;
    issueDate: string;
    vendor?: string;
}

interface NOITrendChartProps {
    noiList: NOIItem[];
    months?: number;  // 顯示最近幾個月的數據
    filterByVendor?: boolean;
    selectedVendor?: string;
}

const NOITrendChart: React.FC<NOITrendChartProps> = React.memo(({
    noiList,
    months = 6,
    filterByVendor = false,
    selectedVendor = ''
}) => {
    const { t } = useLanguage();

    // 統計每月 NOI 數量
    const chartData = useMemo(() => {
        const filteredList = filterByVendor && selectedVendor
            ? noiList.filter(n => n.vendor === selectedVendor)
            : noiList;

        // 生成最近 N 個月的標籤
        const monthLabels: string[] = [];
        const today = new Date();
        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            monthLabels.push(d.toISOString().slice(0, 7)); // 'YYYY-MM'
        }

        // 統計每月數量
        const monthCounts: { [key: string]: number } = {};
        monthLabels.forEach(m => { monthCounts[m] = 0; });

        filteredList.forEach(noi => {
            if (noi.issueDate) {
                const month = noi.issueDate.slice(0, 7);
                if (monthCounts[month] !== undefined) {
                    monthCounts[month]++;
                }
            }
        });

        return monthLabels.map(month => {
            const [year, mon] = month.split('-');
            const displayName = `${year}年${parseInt(mon)}月`;
            return {
                month: displayName,
                count: monthCounts[month] || 0
            };
        });
    }, [noiList, months, filterByVendor, selectedVendor]);

    if (chartData.every(d => d.count === 0)) {
        return (
            <div className={styles.chartCard}>
                <h3 className={styles.chartCardTitle}>{t('dashboard.noiTrendChart') || 'NOI Monthly Trend'}</h3>
                <div className={styles.emptyChart}>
                    {t('common.noData') || 'No data available'}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.chartCard}>
            <h3 className={styles.chartCardTitle}>{t('dashboard.noiTrendChart') || 'NOI Monthly Trend'}</h3>
            <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                        formatter={(value: number) => [`${value} ${t('common.items') || 'items'}`, t('dashboard.noiCount') || 'NOI Count']}
                    />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        activeDot={{ r: 6 }}
                        name={t('dashboard.noiCount') || 'NOI Count'}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
});

export default NOITrendChart;
