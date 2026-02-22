import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useKMStore } from '../../store/kmStore';
import { KMArticle } from '../../types/km';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { KMModal } from './KMModals';
import { KMDetail } from './KMDetail';
import ConfirmModal from '../Shared/ConfirmModal';
import { BackButton } from '@/components/ui/BackButton';
import styles from './KM.module.css';

const KM: React.FC = () => {
  const { t } = useLanguage();
  const { kmList, loading, error, fetchKMs, deleteKM } = useKMStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const [currentView, setCurrentView] = useState<'list' | 'detail'>('list');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null }>({
    isOpen: false,
    id: null,
  });

  // Fetch data on mount
  useEffect(() => {
    fetchKMs();
  }, [fetchKMs]);

  // Derived state
  const selectedArticle = useMemo(() => {
    if (!selectedArticleId) return null;
    return kmList.find(a => a.id === selectedArticleId) || null;
  }, [selectedArticleId, kmList]);

  // Client-side filtering — exclude child chapters (parent_id present)
  const filteredData = useMemo(() => {
    return kmList.filter(article => {
      // Only show root/parent documents, not child chapters
      if (article.parent_id) return false;
      const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (article.articleNo && article.articleNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (article.tags && article.tags.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = categoryFilter === 'All' || article.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [kmList, searchQuery, categoryFilter]);

  // Handlers
  const handleAddNew = useCallback(() => {
    setSelectedArticleId(null);
    setIsModalOpen(true);
  }, []);

  const handleEdit = useCallback((id: string) => {
    setSelectedArticleId(id);
    setIsModalOpen(true);
  }, []);

  const handleViewDetails = useCallback((id: string) => {
    setSelectedArticleId(id);
    setCurrentView('detail');
  }, []);

  const handleDeleteClick = useCallback((id: string) => {
    setDeleteModal({ isOpen: true, id });
  }, []);

  const handleDeleteConfirm = async () => {
    if (deleteModal.id) {
      await deleteKM(deleteModal.id);
      setDeleteModal({ isOpen: false, id: null });
      if (currentView === 'detail' && selectedArticleId === deleteModal.id) {
        setCurrentView('list');
        setSelectedArticleId(null);
      }
    }
  };

  const columns = useMemo(() => createColumns(handleDeleteClick, t), [handleDeleteClick, t]);

  return (
    <div className={`${styles.container} ${currentView === 'detail' ? styles.detailMode : ''}`}>
      {currentView === 'list' ? (
        <>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <BackButton />
              <h1>{t('km.title') || 'Knowledge Management'}</h1>
            </div>
            <div className={styles.headerRight}>
              <select
                className={styles.filterSelect}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="All">All Categories</option>
                <option value="General">General</option>
                <option value="Safety">Safety</option>
                <option value="Quality">Quality</option>
                <option value="Procedure">Procedure</option>
                <option value="Guidelines">Guidelines</option>
              </select>
              <input
                type="text"
                className={styles.searchInput}
                placeholder={t('common.search') || 'Search...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.content}>
            {loading && <p>{t('common.loading') || 'Loading...'}</p>}
            {error && <p className={styles.errorText}>{error}</p>}

            {!loading && !error && (
              <DataTable
                title={t('km.listTitle') || 'Document List'}
                data={filteredData}
                columns={columns}
                actions={
                  <button className={styles.addButton} onClick={handleAddNew}>
                    + {t('km.addNew') || 'Add Article'}
                  </button>
                }
                searchKey="" // Disabling internal search as we do client side
                onRowClick={(row) => handleViewDetails(row.id)}
              />
            )}
          </div>
        </>
      ) : (
        selectedArticle && (
          <KMDetail
            article={selectedArticle}
            onClose={() => {
              setCurrentView('list');
              setSelectedArticleId(null);
            }}
            onEdit={() => handleEdit(selectedArticle.id)}
            onSelectArticle={(article) => setSelectedArticleId(article.id)}
          />
        )
      )}

      {isModalOpen && (
        <KMModal
          id={selectedArticleId}
          existingData={selectedArticle || undefined}
          onSaveSuccess={() => setIsModalOpen(false)}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDeleteTitle') || 'Confirm Delete'}
        message={t('common.confirmDelete') || 'Are you sure you want to delete this article?'}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteModal({ isOpen: false, id: null })}
        confirmText={t('common.delete') || 'Delete'}
        cancelText={t('common.cancel') || 'Cancel'}
      />
    </div>
  );
};

export default KM;
