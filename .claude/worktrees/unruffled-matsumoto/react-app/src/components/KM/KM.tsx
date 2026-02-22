import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import styles from './KM.module.css';

const KM: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/')}>
            ← {t('common.back') || 'Back'}
          </button>
          <h1>{t('km.title')}</h1>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.placeholder}>
          <h2>{t('km.systemTitle')}</h2>
          <p>Knowledge Management System</p>
          <p className={styles.description}>
            {t('km.description')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default KM;
