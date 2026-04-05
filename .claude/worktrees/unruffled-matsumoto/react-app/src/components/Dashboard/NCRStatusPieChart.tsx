import React, { useMemo } from 'react';
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { useLanguage } from '../../context/LanguageContext';
import styles from './Dashboard.module.css';

interface NCRItem {
    id: string;
    status: string;
    vendor: string;
}

interface NCRStatusPieChartProps {
    ncrList: NCRItem[];
    filterByVendor?: boolean;
    selectedVendor?: string;
}

// 狀態顏色映射
const STATUS_COLORS: { [key: string]: string } = {
    open: '#ef4444',
    closed: '#22c55e',
    cancelled: '#94a3b8',
    pending: '#f59e0b',
    'under review': '#3b82f6',
};

const NCRStatusPieChart: React.FC<NCRStatusPieChartProps> = ({
    ncrList,
    filterByVendor = false,
    selectedVendor = ''
}) => {
    const { t } = useLanguage();

    // 過濾並統計各狀態數量
    const chartData = useMemo(() => {
        const filteredList = filterByVendor && selectedVendor
            ? ncrList.filter(n => n.vendor === selectedVendor)
            : ncrList;

        const statusCount: { [key: string]: number } = {};
        filteredList.forEach(ncr => {
            const status = ncr.status.toLowerCase();
            statusCount[status] = (statusCount[status] || 0) + 1;
        });

        return Object.entries(statusCount).map(([status, count]) => ({
            name: t(`status.${status}`) || status,
            value: count,
            color: STATUS_COLORS[status] || '#6b7280'
        }));
    }, [ncrList, filterByVendor, selectedVendor, t]);

    if (chartData.length === 0) {
        return (
            <div className={styles.chartCard}>
                <h3 className={styles.chartCardTitle}>{t('dashboard.ncrStatusChart') || 'NCR Status Distribution'}</h3>
                <div className={styles.emptyChart}>
                    {t('common.noData') || 'No data available'}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.chartCard}>
            <h3 className={styles.chartCardTitle}>{t('dashboard.ncrStatusChart') || 'NCR Status Distribution'}</h3>
            <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip
                        formatter={(value: number) => [`${value} ${t('common.items') || 'items'}`, '']}
                    />
                    <Legend />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default NCRStatusPieChart;
