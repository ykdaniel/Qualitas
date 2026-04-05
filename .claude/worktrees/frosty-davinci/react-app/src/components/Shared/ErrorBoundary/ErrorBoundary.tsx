import React, { Component, ErrorInfo, ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';
import { LanguageContext } from '../../../context/LanguageContext';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * 全域錯誤邊界元件
 * 捕捉子元件 render 時的 JavaScript 錯誤，避免整個應用崩潰
 */
class ErrorBoundary extends Component<Props, State> {
    static contextType = LanguageContext;
    declare context: React.ContextType<typeof LanguageContext>;

    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        // 更新 state，下次 render 時顯示備援 UI
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // 可在此將錯誤記錄到監控服務
        // 例如: Sentry, LogRocket, 等
        this.setState({ errorInfo });

        // NOTE: 在生產環境中，這裡應該發送到錯誤追蹤服務
        if (import.meta.env.DEV) {
            console.error('ErrorBoundary caught an error:', error, errorInfo);
        }
    }

    handleReset = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });
    };

    handleReload = (): void => {
        window.location.reload();
    };

    render(): ReactNode {
        const t = this.context?.t || ((key: string) => key);

        if (this.state.hasError) {
            // 如果有提供自訂 fallback，使用它
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // 預設錯誤 UI
            return (
                <div className={styles.container}>
                    <div className={styles.content}>
                        <div className={styles.icon}>⚠️</div>
                        <h1 className={styles.title}>{t('error.title')}</h1>
                        <p className={styles.message}>
                            {t('error.description')}
                        </p>

                        {import.meta.env.DEV && this.state.error && (
                            <details className={styles.details}>
                                <summary>{t('error.details')} (DEV)</summary>
                                <pre className={styles.errorStack}>
                                    {this.state.error.toString()}
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </details>
                        )}

                        <div className={styles.actions}>
                            <button
                                className={styles.retryButton}
                                onClick={this.handleReset}
                            >
                                {t('error.retry')}
                            </button>
                            <button
                                className={styles.reloadButton}
                                onClick={this.handleReload}
                            >
                                {t('error.refresh')}
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
