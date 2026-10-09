import React from 'react';
import { useNotification, Notification as NotificationType } from '../../context/NotificationContext';
import styles from './ToastContainer.module.css';

// 圖示元件
const Icons = {
    success: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    ),
    error: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
    ),
    warning: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    ),
    info: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    )
};

interface ToastProps {
    notification: NotificationType;
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ notification, onClose }) => {
    return (
        <div className={`${styles.toast} ${styles[notification.type]}`}>
            <div className={styles.iconWrapper}>
                {Icons[notification.type]}
            </div>
            <div className={styles.content}>
                <div className={styles.title}>{notification.title}</div>
                {notification.message && (
                    <div className={styles.message}>{notification.message}</div>
                )}
            </div>
            <button className={styles.closeButton} onClick={onClose}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
};

/**
 * Toast 容器元件
 * 顯示所有通知訊息，固定在畫面右上角
 */
const ToastContainer: React.FC = () => {
    const { notifications, removeNotification } = useNotification();

    if (notifications.length === 0) {
        return null;
    }

    return (
        <div className={styles.container}>
            {notifications.map(notification => (
                <Toast
                    key={notification.id}
                    notification={notification}
                    onClose={() => removeNotification(notification.id)}
                />
            ))}
        </div>
    );
};

export default ToastContainer;
