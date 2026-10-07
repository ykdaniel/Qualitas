/**
 * 錯誤處理工具函式
 * 用於替代 catch (err: any) 模式，提供型別安全的錯誤處理
 */

import { AxiosError } from 'axios';

/**
 * 從 unknown 型別的錯誤中提取錯誤訊息
 * @param error - catch 區塊中的錯誤物件
 * @param fallbackMessage - 無法解析時的預設訊息
 */
export function getErrorMessage(error: unknown, fallbackMessage = 'An unknown error occurred'): string {
    // Axios 錯誤
    if (isAxiosError(error)) {
        const status = error.response?.status;
        const detail = error.response?.data?.detail;
        // A server error is not something the user can act on, and its body may carry a full validation dump (in non-production
        // builds) — show one friendly line, never the stack. (2026-09-20)
        if (status !== undefined && status >= 500) {
            return '伺服器處理資料時發生錯誤（HTTP ' + status + '），請稍後重試或聯絡管理員。 / Server error (HTTP ' + status + '), please retry later or contact an administrator.';
        }
        if (typeof detail === 'string') {
            return detail;
        }
        if (Array.isArray(detail)) {
            // Date refusals carry a stable `code` and the offending field in `loc`: name the field ("raiseDate: date is not a real
            // calendar date"). Other array-shaped details keep their previous text.
            return detail.map((e: { msg?: string; loc?: unknown[]; code?: string }) => {
                const field = Array.isArray(e?.loc) && e.code ? String(e.loc[e.loc.length - 1]) : '';
                return field && e?.msg ? `${field}: ${e.msg}` : (e?.msg || JSON.stringify(e));
            }).join(', ');
        }
        return error.message || fallbackMessage;
    }

    // 標準 Error 物件
    if (error instanceof Error) {
        return error.message;
    }

    // 字串錯誤
    if (typeof error === 'string') {
        return error;
    }

    return fallbackMessage;
}

/**
 * 型別守衛：檢查是否為 Axios 錯誤
 */
export function isAxiosError(error: unknown): error is AxiosError<{ detail?: string | Array<{ msg?: string }> }> {
    return (
        typeof error === 'object' &&
        error !== null &&
        'isAxiosError' in error &&
        (error as AxiosError).isAxiosError === true
    );
}

/**
 * 從錯誤中提取 HTTP 狀態碼
 */
export function getErrorStatusCode(error: unknown): number | undefined {
    if (isAxiosError(error)) {
        return error.response?.status;
    }
    return undefined;
}
