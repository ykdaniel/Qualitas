import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    message?: string;
    duration?: number;  // 自動關閉時間（毫秒），0 表示不自動關閉
}

interface NotificationContextType {
    notifications: Notification[];
    addNotification: (notification: Omit<Notification, 'id'>) => void;
    removeNotification: (id: string) => void;
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    warning: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotification = (): NotificationContextType => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};

interface NotificationProviderProps {
    children: ReactNode;
    defaultDuration?: number;
}

/**
 * 通知系統 Context Provider
 * 提供全域通知功能，支援 success/error/warning/info 類型
 */
export const NotificationProvider: React.FC<NotificationProviderProps> = ({
    children,
    defaultDuration = 5000
}) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
        const id = `notify-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const duration = notification.duration ?? defaultDuration;

        const newNotification: Notification = {
            ...notification,
            id,
            duration
        };

        setNotifications(prev => [...prev, newNotification]);

        // 自動關閉
        if (duration > 0) {
            setTimeout(() => {
                removeNotification(id);
            }, duration);
        }
    }, [defaultDuration, removeNotification]);

    const success = useCallback((title: string, message?: string) => {
        addNotification({ type: 'success', title, message });
    }, [addNotification]);

    const error = useCallback((title: string, message?: string) => {
        addNotification({ type: 'error', title, message, duration: 0 }); // 錯誤不自動關閉
    }, [addNotification]);

    const warning = useCallback((title: string, message?: string) => {
        addNotification({ type: 'warning', title, message, duration: 8000 });
    }, [addNotification]);

    const info = useCallback((title: string, message?: string) => {
        addNotification({ type: 'info', title, message });
    }, [addNotification]);

    const value: NotificationContextType = {
        notifications,
        addNotification,
        removeNotification,
        success,
        error,
        warning,
        info
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};

export default NotificationContext;
