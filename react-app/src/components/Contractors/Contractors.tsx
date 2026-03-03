import React, { useState, useEffect } from 'react';
import { ColumnDef } from '@tanstack/react-table';
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
import { createColumns } from './columns';
import { BackButton } from '@/components/ui/BackButton';

// ─── Project Columns ────────────────────────────────────────────────────────
const createProjectColumns = (
  onEdit: (p: Project) => void,
  onDelete: (id: string) => void,
): ColumnDef<Project>[] => [
  {
    accessorKey: 'name',
    header: 'Project Name',
  },
  {
    accessorKey: 'code',
    header: 'Code',
    cell: ({ row }) => row.original.code || '—',
  },
  {
    accessorKey: 'owner',
    header: 'Owner',
    cell: ({ row }) => row.original.owner || '—',
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => row.original.description || '—',
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(row.original); }}
          style={{ padding: '4px 12px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
        >Edit</button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(row.original.id); }}
          style={{ padding: '4px 12px', borderRadius: '6px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
        >Delete</button>
      </div>
    ),
  },
];


// ─── Project Modal ───────────────────────────────────────────────────────────
interface ProjectModalProps {
  existing?: Project;
  onSave: (data: Omit<Project, 'id' | 'created_at'>) => void;
  onClose: () => void;
}

const ProjectModal: React.FC<ProjectModalProps> = ({ existing, onSave, onClose }) => {
  const [form, setForm] = useState({
    name: existing?.name || '',
    code: existing?.code || '',
    description: existing?.description || '',
    owner: existing?.owner || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: '16px', fontWeight: 700 }}>
          {existing ? 'Edit Project' : 'Add Project'}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>Project Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label>Code / Abbreviation</label>
            <input
              type="text"
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. HAI, YL, GCH"
            />
          </div>
          <div className={styles.formGroup}>
            <label>Owner</label>
            <input
              type="text"
              value={form.owner}
              onChange={e => setForm({ ...form, owner: e.target.value })}
              placeholder="Owner / Client name"
            />
          </div>
          <div className={styles.formGroup}>
            <label>Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={styles.submitButton}>
              {existing ? 'Save' : 'Add'}
            </button>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────
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
    if (!searchQuery.trim()) return contractors;
    const q = searchQuery.toLowerCase();
    return contractors.filter(item =>
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.package && item.package.toLowerCase().includes(q)) ||
      (item.abbreviation && item.abbreviation.toLowerCase().includes(q)) ||
      (item.scope && item.scope.toLowerCase().includes(q)) ||
      (item.contactPerson && item.contactPerson.toLowerCase().includes(q)) ||
      (item.email && item.email.toLowerCase().includes(q)) ||
      (item.phone && item.phone.toLowerCase().includes(q))
    );
  }, [contractors, searchQuery]);

  const resetForm = () => {
    setEditingId(null);
    setFormData({ package: '', name: '', abbreviation: '', scope: '', contactPerson: '', email: '', phone: '', address: '', status: 'active' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await updateContractor(editingId, formData);
    } else {
      await addContractor(formData);
    }
    setIsModalOpen(false);
    resetForm();
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
    ),
    []
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1>{t('contractors.title')}</h1>
        </div>
        {activeTab === 'contractors' && (
          <div className={styles.headerRight}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('common.search') || 'Search...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '0' }}>
        {(['contractors', 'projects'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 20px',
              fontWeight: 600,
              fontSize: '14px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: activeTab === tab ? '#3b82f6' : '#64748b',
              borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
              marginBottom: '-2px',
              transition: 'color 0.2s',
            }}
          >
            {tab === 'contractors' ? t('contractors.title') : 'Project Info'}
          </button>
        ))}
      </div>

      {/* Contractors Tab */}
      {activeTab === 'contractors' && (
        <div className={styles.content}>
          <DataTable
            title={t('contractors.title')}
            actions={
              <button className={styles.addNewButton} onClick={() => { resetForm(); setIsModalOpen(true); }}>
                {t('contractors.addContractor')}
              </button>
            }
            columns={createColumns(handleEdit, handleDeleteClick, t)}
            data={filteredContractors}
            searchKey=""
            getRowId={(row) => row.id.toString()}
            onRowClick={(row) => handleEdit(row)}
          />
        </div>
      )}

      {/* Project Info Tab */}
      {activeTab === 'projects' && (
        <div className={styles.content}>
          <DataTable
            title="Project Info"
            actions={
              <button className={styles.addNewButton} onClick={() => { setEditingProject(undefined); setIsProjectModalOpen(true); }}>
                + Add Project
              </button>
            }
            columns={projectColumns}
            data={projectList}
            searchKey="name"
            searchPlaceholder="Search projects..."
            getRowId={(row) => row.id}
            onRowClick={(row) => { setEditingProject(row); setIsProjectModalOpen(true); }}
          />
        </div>
      )}

      {/* Contractor Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDeleteTitle')}
        message={deleteModal.message || t('contractors.confirmDelete')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      {isModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h2>{editingId ? t('contractors.editContractor') : t('contractors.addContractor')}</h2>
            <form onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label>{t('contractors.package')}</label>
                <input type="text" value={formData.package} onChange={e => setFormData({ ...formData, package: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label>{t('contractors.name')}</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className={styles.formGroup}>
                <label>{t('contractors.abbreviation')}</label>
                <input type="text" value={formData.abbreviation} onChange={e => setFormData({ ...formData, abbreviation: e.target.value })} required />
              </div>
              <div className={styles.formGroup}>
                <label>{t('contractors.scope')}</label>
                <input type="text" value={formData.scope} onChange={e => setFormData({ ...formData, scope: e.target.value })} required />
              </div>
              <div className={styles.formGroup}>
                <label>{t('contractors.contactPerson')}</label>
                <input type="text" value={formData.contactPerson} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })} required />
              </div>
              <div className={styles.formGroup}>
                <label>{t('contractors.email')}</label>
                <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required />
              </div>
              <div className={styles.formGroup}>
                <label>{t('contractors.phone')}</label>
                <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} required />
              </div>
              <div className={styles.formGroup}>
                <label>{t('contractors.address')}</label>
                <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} required />
              </div>
              <div className={styles.formGroup}>
                <label>{t('contractors.status')}</label>
                <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}>
                  <option value="active">{t('contractors.status.active')}</option>
                  <option value="inactive">{t('contractors.status.inactive')}</option>
                </select>
              </div>
              <div className={styles.formActions}>
                <button type="submit" className={styles.submitButton}>{editingId ? t('common.save') : t('common.add')}</button>
                <button type="button" className={styles.cancelButton} onClick={() => { setIsModalOpen(false); resetForm(); }}>{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project Modal */}
      {isProjectModalOpen && (
        <ProjectModal
          existing={editingProject}
          onSave={handleProjectSave}
          onClose={() => { setIsProjectModalOpen(false); setEditingProject(undefined); }}
        />
      )}

      <ConfirmModal
        isOpen={projectDeleteModal.isOpen}
        title="Confirm Delete"
        message="Are you sure you want to delete this project?"
        onConfirm={handleProjectDeleteConfirm}
        onCancel={() => setProjectDeleteModal({ isOpen: false, id: null })}
        confirmText="Delete"
        cancelText="Cancel"
      />
    </div>
  );
};

export default Contractors;
