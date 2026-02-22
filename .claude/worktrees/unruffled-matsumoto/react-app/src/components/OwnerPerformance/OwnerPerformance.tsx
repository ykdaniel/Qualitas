import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import styles from './OwnerPerformance.module.css';

const OwnerPerformance: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useLanguage();

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <button type="button" className={styles.backButton} onClick={() => navigate('/')}>
                    ← {t('common.back')}
                </button>
                <h1>{t('ownerPerformance.title')}</h1>
            </div>

            <div className={styles.content}>
                <div className={styles.placeholder}>
                    <p>{t('ownerPerformance.placeholder') || 'Owner Performance tracking and analytics content will be implemented here.'}</p>
                </div>
            </div>
        </div>
    );
};

export default OwnerPerformance;
