import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import styles from './IAM.module.css';
import { BackButton } from '@/components/ui/BackButton';
import { useIAMStore } from '../../store/iamStore';

import UserManagement from './UserManagement';
import RoleManagement from './RoleManagement';
import PermissionMatrix from './PermissionMatrix';

const IAM: React.FC = () => {
  const { t } = useLanguage();
  const { fetchUsers, fetchRoles, fetchPermissions, loading, error, clearError } = useIAMStore();
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'permissions'>('users');

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) {
      // Potentially use a toast here
      console.error(error);
      const timer = setTimeout(() => clearError(), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1>{t('iam.title')}</h1>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'users' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('users')}
        >
          {t('iam.users')}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'roles' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('roles')}
        >
          {t('iam.roles')}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'permissions' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('permissions')}
        >
          {t('iam.permissions')}
        </button>
      </div>

      <div className={styles.contentWrapper}>
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'roles' && <RoleManagement />}
        {activeTab === 'permissions' && <PermissionMatrix />}
      </div>

      {loading && activeTab !== 'permissions' && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white p-4 rounded shadow-lg z-50">
          {error}
        </div>
      )}
    </div>
  );
};

export default IAM;
