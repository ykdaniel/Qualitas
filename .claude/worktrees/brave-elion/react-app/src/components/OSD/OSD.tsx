import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import styles from './OSD.module.css';

const OSD: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/')}>
            ← {t('common.back')}
          </button>
          <h1>{t('osd.title')}</h1>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.placeholder}>
          <h2>{t('osd.placeholderTitle')}</h2>
          <p>OSD Module</p>
          <p className={styles.description}>
            {t('osd.description')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default OSD;
