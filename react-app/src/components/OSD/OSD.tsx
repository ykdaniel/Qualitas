import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import styles from './OSD.module.css';

const OSD: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className={styles.container}>
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
