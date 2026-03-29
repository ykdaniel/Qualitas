import React, { useState, useEffect, useDeferredValue } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore, Contractor } from '../../store/contractorsStore';
import { useProjectStore, Project } from '../../store/projectStore';
import { useITPStore } from '../../store/itpStore';
import { useNCRStore } from '../../store/ncrStore';
import { useNOIStore } from '../../store/noiStore';
import { useITRStore } from '../../store/itrStore';
import { usePQPStore } from '../../store/pqpStore';
import { useOBSStore } from '../../store/obsStore';
import { useFATStore } from '../../store/fatStore';
import { useFollowUpStore } from '../../store/followUpStore';
import { useAuditStore } from '../../store/auditStore';
import { checkContractorReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './Contractors.module.css';

import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns, createProjectColumns } from './columns';
import { BackButton } from '@/components/ui/BackButton';
import { Search, Plus } from 'lucide-react';
import ContractorModal from './ContractorModal';
import ProjectModal from './ProjectModal';

const Contractors: React.FC = () => {
    const { t } = useLanguage();
    const { contractors, addContractor, updateContractor, deleteContractor } = useContractorsStore();
    const { projectList, fetchProjects, addProject, updateProject, deleteProject } = useProjectStore();

    // Get all module lists for cascade delete checking
    const itpList = useITPStore(state => state.itpList);
    const ncrList = useNCRStore(state => state.ncrList);
    const noiList = useNOIStore(state => state.noiList);
    const itrList = useITRStore(state => state.itrList);
    const pqpList = usePQPStore(state => state.pqpList);
    const obsList = useOBSStore(state => state.obsList);
    const fatList = useFATStore(state => state.fatList);
    const followUpList = useFollowUpStore(state => state.followUpList);
    const auditList = useAuditStore(state => state.auditList);

    // Tabs
    const [activeTab, setActiveTab] = useState<'contractors' | 'projects'>('contractors');

    // Contractor state
    const [searchQuery, setSearchQuery] = useState<string>('');
    const deferredQuery = useDeferredValue(searchQuery);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
        isOpen: false, id: null, message: '',
    });
    const [formData, setFormData] = useState({
        package: '', name: '', abbreviation: '', scope: '',
        contactPerson: '', email: '', phone: '', address: '',
        status: 'active' as 'active' | 'inactive',
    });

    // Project state
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);
    const [projectDeleteModal, setProjectDeleteModal] = useState<{ isOpen: boolean; id: string | null }>({
        isOpen: false, id: null,
    });

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    // ── Contractor handlers ──────────────────────────────────────────────────
    const filteredContractors = React.useMemo(() => {
        if (!deferredQuery.trim()) return contractors;
        const q = deferredQuery.toLowerCase();
        return contractors.filter(item =>
            (item.name && item.name.toLowerCase().includes(q)) ||
            (item.package && item.package.toLowerCase().includes(q)) ||
            (item.abbreviation && item.abbreviation.toLowerCase().includes(q)) ||
            (item.scope && item.scope.toLowerCase().includes(q)) ||
            (item.contactPerson && item.contactPerson.toLowerCase().includes(q)) ||
            (item.email && item.email.toLowerCase().includes(q)) ||
            (item.phone && item.phone.toLowerCase().includes(q))
        );
    }, [contractors, deferredQuery]);

    const handleContractorSave = async (id: string | null, data: any) => {
        if (id) {
            await updateContractor(id, data);
        } else {
            await addContractor(data);
        }
        setIsModalOpen(false);
    };

    const handleEdit = (contractor: Contractor) => {
        setEditingId(contractor.id);
        setFormData({
            package: contractor.package || '', name: contractor.name,
            abbreviation: contractor.abbreviation || '', scope: contractor.scope,
            contactPerson: contractor.contactPerson, email: contractor.email,
            phone: contractor.phone, address: contractor.address, status: contractor.status,
        });
        setIsModalOpen(true);
    };

    const handleDeleteClick = (id: string) => {
        const contractor = contractors.find(c => c.id === id);
        if (!contractor) return;
        const references = checkContractorReferences(id, contractor.name, itpList, ncrList, noiList, itrList, pqpList, obsList, fatList, followUpList, auditList);
        const message = generateDeleteMessage('Contractor', contractor.name, references.references, t);
        setDeleteModal({ isOpen: true, id, message });
    };

    const handleDeleteConfirm = async () => {
        if (deleteModal.id) {
            await deleteContractor(deleteModal.id);
            setDeleteModal({ isOpen: false, id: null, message: '' });
        }
    };

    // ── Project handlers ─────────────────────────────────────────────────────
    const handleProjectSave = async (data: Omit<Project, 'id' | 'created_at'>) => {
        if (editingProject) {
            await updateProject(editingProject.id, data);
        } else {
            await addProject(data);
        }
        setIsProjectModalOpen(false);
        setEditingProject(undefined);
    };

    const handleProjectDeleteConfirm = async () => {
        if (projectDeleteModal.id) {
            await deleteProject(projectDeleteModal.id);
            setProjectDeleteModal({ isOpen: false, id: null });
        }
    };

    const projectColumns = React.useMemo(
        () => createProjectColumns(
            (p) => { setEditingProject(p); setIsProjectModalOpen(true); },
            (id) => setProjectDeleteModal({ isOpen: true, id }),
            t
        ),
        [t]
    );

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <BackButton />
                    <h1>{t('contractors.title')} / Projects</h1>
                </div>

                {/* Animated Pills Tabs */}
                <div className={styles.tabsContainer}>
                    <button
                        className={`${styles.tabButton} ${activeTab === 'contractors' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('contractors')}
                    >
                        {t('contractors.title')}
                    </button>
                    <button
                        className={`${styles.tabButton} ${activeTab === 'projects' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('projects')}
                    >
                        Projects
                    </button>
                    <div className={`${styles.tabIndicator} ${styles[activeTab]}`} />
                </div>
            </div>

            {/* Content Area */}
            <div className={styles.contentWrapper}>
                {/* Search & Actions Bar */}
                <div className={styles.actionBar}>
                    <div className={styles.searchContainer}>
                        {activeTab === 'contractors' && (
                            <>
                                <Search className={styles.searchIcon} size={18} />
                                <input
                                    type="text"
                                    className={styles.searchInput}
                                    placeholder={t('common.search') || 'Search contractors...'}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </>
                        )}
                    </div>

                    <div className={styles.actionsBox}>
                        {activeTab === 'contractors' ? (
                            <button className={styles.addNewButton} onClick={() => {
                                setEditingId(null);
                                setFormData({ package: '', name: '', abbreviation: '', scope: '', contactPerson: '', email: '', phone: '', address: '', status: 'active' });
                                setIsModalOpen(true);
                            }}>
                                <Plus size={18} />
                                {t('contractors.addContractor')}
                            </button>
                        ) : (
                            <button className={`${styles.addNewButton} ${styles.blueBtn}`} onClick={() => { setEditingProject(undefined); setIsProjectModalOpen(true); }}>
                                <Plus size={18} />
                                Add Project
                            </button>
                        )}
                    </div>
                </div>

                {/* Tables */}
                <div className={styles.tableCard}>
                    {activeTab === 'contractors' && (
                        <div className={styles.tableFadeIn}>
                            <DataTable
                                title={t('contractors.title')}
                                actions={null} // Actions migrated to top bar
                                columns={createColumns(handleEdit, handleDeleteClick, t)}
                                data={filteredContractors}
                                searchKey="" // We handle search externally
                                getRowId={(row: Contractor) => row.id.toString()}
                                onRowClick={(row: Contractor) => handleEdit(row)}
                            />
                        </div>
                    )}

                    {activeTab === 'projects' && (
                        <div className={styles.tableFadeIn}>
                            <DataTable
                                title="Project Info"
                                actions={null}
                                columns={projectColumns}
                                data={projectList}
                                searchKey="name"
                                searchPlaceholder="Search projects inline..."
                                getRowId={(row: Project) => row.id}
                                onRowClick={(row: Project) => { setEditingProject(row); setIsProjectModalOpen(true); }}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('common.confirmDeleteTitle')}
                message={deleteModal.message || t('contractors.confirmDelete')}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
            />

            <ConfirmModal
                isOpen={projectDeleteModal.isOpen}
                title="Confirm Delete"
                message="Are you sure you want to delete this project?"
                onConfirm={handleProjectDeleteConfirm}
                onCancel={() => setProjectDeleteModal({ isOpen: false, id: null })}
                confirmText="Delete"
                cancelText="Cancel"
            />

            {isModalOpen && (
                <ContractorModal 
                    existingId={editingId}
                    initialData={formData}
                    onSave={handleContractorSave}
                    onClose={() => setIsModalOpen(false)}
                    t={t}
                />
            )}

            {isProjectModalOpen && (
                <ProjectModal
                    existing={editingProject}
                    onSave={handleProjectSave}
                    onClose={() => setIsProjectModalOpen(false)}
                />
            )}
        </div>
    );
};

export default Contractors;
