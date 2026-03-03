import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import styles from './OwnerPerformance.module.css';
import { BackButton } from '@/components/ui/BackButton';

const OwnerPerformance: React.FC = () => {
    const { t } = useLanguage();

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <BackButton />
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
