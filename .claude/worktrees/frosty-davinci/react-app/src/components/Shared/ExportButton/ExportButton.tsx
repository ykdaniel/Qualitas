import React, { useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useLanguage } from '../../../context/LanguageContext';
import styles from './ExportButton.module.css';

interface ExportButtonProps<T> {
    data: T[];
    filename: string;
    sheetName?: string;
    columns?: {
        key: keyof T;
        header: string;
        formatter?: (value: any) => string;
    }[];
    buttonLabel?: string;
    disabled?: boolean;
}

/**
 * 通用 Excel 匯出按鈕元件
 * 使用 xlsx 套件將資料匯出為 .xlsx 檔案
 */
function ExportButton<T extends Record<string, any>>({
    data,
    filename,
    sheetName = 'Sheet1',
    columns,
    buttonLabel,
    disabled = false
}: ExportButtonProps<T>) {
    const { t } = useLanguage();

    const handleExport = useCallback(() => {
        if (data.length === 0) {
            alert(t('common.noDataToExport') || 'No data to export');
            return;
        }

        // 準備匯出資料
        let exportData: Record<string, any>[];

        if (columns && columns.length > 0) {
            // 使用指定的欄位映射
            exportData = data.map(item => {
                const row: Record<string, any> = {};
                columns.forEach(col => {
                    const value = item[col.key];
                    row[col.header] = col.formatter ? col.formatter(value) : value;
                });
                return row;
            });
        } else {
            // 直接使用原始資料
            exportData = data;
        }

        // 建立工作簿
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        // 自動調整欄寬
        const colWidths = Object.keys(exportData[0] || {}).map(key => ({
            wch: Math.max(
                key.length,
                ...exportData.map(row => String(row[key] || '').length)
            ) + 2
        }));
        worksheet['!cols'] = colWidths;

        // 下載檔案
        const timestamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `${filename}_${timestamp}.xlsx`);
    }, [data, filename, sheetName, columns, t]);

    return (
        <button
            className={styles.exportButton}
            onClick={handleExport}
            disabled={disabled || data.length === 0}
            title={data.length === 0 ? (t('common.noDataToExport') || 'No data to export') : ''}
        >
            <svg
                className={styles.exportIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
            >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {buttonLabel || t('common.exportExcel') || 'Export Excel'}
        </button>
    );
}

export default ExportButton;
