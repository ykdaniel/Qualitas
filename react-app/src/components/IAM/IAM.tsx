import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import styles from './IAM.module.css';
import { BackButton } from '@/components/ui/BackButton';
import { useIAMStore } from '../../store/iamStore';
import { AlertCircle, X, Search } from 'lucide-react';

import UserManagement from './UserManagement';
import RoleManagement from './RoleManagement';
import PermissionMatrix from './PermissionMatrix';

type IAMTab = 'users' | 'roles' | 'permissions';

const IAM: React.FC = () => {
  const { t } = useLanguage();
  const { fetchUsers, fetchRoles, fetchPermissions, error, clearError } = useIAMStore();
  const [activeTab, setActiveTab] = useState<IAMTab>('users');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) {
      console.error(error);
      const timer = setTimeout(() => clearError(), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  const handleTabSwitch = (tab: IAMTab) => {
      setActiveTab(tab);
      setSearchQuery('');
  };

  const renderTabs = () => (
      <div className={styles.tabsContainer}>
          <button
              className={`${styles.tabButton} ${activeTab === 'users' ? styles.activeTab : ''}`}
              onClick={() => handleTabSwitch('users')}
          >
              {t('iam.users')}
          </button>
          <button
              className={`${styles.tabButton} ${activeTab === 'roles' ? styles.activeTab : ''}`}
              onClick={() => handleTabSwitch('roles')}
          >
              {t('iam.roles')}
          </button>
          <button
              className={`${styles.tabButton} ${activeTab === 'permissions' ? styles.activeTab : ''}`}
              onClick={() => handleTabSwitch('permissions')}
          >
              {t('iam.permissions')}
          </button>
          <div className={`${styles.tabIndicator} ${styles[activeTab]}`} />
      </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1>{t('iam.title')}</h1>
        </div>

        {/* Search Bar Moved to Header */}
        {activeTab !== 'permissions' && (
            <div className={styles.searchContainer}>
                <Search className={styles.searchIcon} size={18} />
                <input
                    type="text"
                    placeholder={activeTab === 'users' ? t('iam.searchUser') : t('iam.searchRole')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                />
            </div>
        )}
      </div>

      {error && (
        <div className={styles.errorAlert}>
            <div className={styles.errorContent}>
                <AlertCircle size={20} />
                <span>{error}</span>
            </div>
            <button onClick={clearError} className={styles.closeBtn}>
                <X size={20} />
            </button>
        </div>
      )}

      {/* Main Content Render */}
      <div className={styles.tabContentWrapper}>
        {activeTab === 'users' && <UserManagement searchQuery={searchQuery} tabsComponent={renderTabs()} />}
        {activeTab === 'roles' && <RoleManagement searchQuery={searchQuery} tabsComponent={renderTabs()} />}
        {activeTab === 'permissions' && (
            <div className={styles.tableCardWrapper}>
                 <div className={styles.actionBar}>
                     {renderTabs()}
                 </div>
                 <div className={styles.tableCard}>
                     <div className={styles.tableFadeIn}>
                         <PermissionMatrix />
                     </div>
                 </div>
            </div>
        )}
      </div>

    </div>
  );
};

export default IAM;
