import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import styles from './OSD.module.css';
import { BackButton } from '@/components/ui/BackButton';

const OSD: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
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
