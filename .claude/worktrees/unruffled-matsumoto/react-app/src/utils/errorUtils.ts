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
        const detail = error.response?.data?.detail;
        if (typeof detail === 'string') {
            return detail;
        }
        if (Array.isArray(detail)) {
            return detail.map((e: { msg?: string }) => e?.msg || JSON.stringify(e)).join(', ');
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
