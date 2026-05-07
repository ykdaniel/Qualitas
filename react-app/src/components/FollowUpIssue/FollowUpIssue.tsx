import React, { useState, useMemo, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle2, BarChart3, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useNCRStore } from '../../store/ncrStore';
import { useOBSStore } from '../../store/obsStore';
import { useNOIStore } from '../../store/noiStore';
import { useITRStore } from '../../store/itrStore';
import { useITPStore } from '../../store/itpStore';
import { usePQPStore } from '../../store/pqpStore';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './FollowUpIssue.module.css';
import formStyles from '../Shared/FormShell.module.css';
import shellStyles from '../Shared/ModuleShell.module.css';
import api from '../../services/api';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { useFollowUpIssueStats } from '../../hooks/useFollowUpIssueStats';

type StatusFilter = 'all' | 'open' | 'closed';

const DonutGauge: React.FC<{ percent: number; size?: number }> = ({ percent, size = 28 }) => {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);
  const cx = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth={stroke} />
      <circle
        cx={cx}
        cy={cx}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cx})`}
      />
    </svg>
  );
};

interface FollowUpIssueItem {
  id: string;
  issueNo: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignedTo: string;
  vendor?: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  action?: string;
  sourceModule?: string;  // 來源模組
  sourceReferenceNo?: string;  // 來源單號
  isExternal?: boolean;  // 標記是否來自其他模組（唯讀）
}

const FollowUpIssue: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [manualIssues, setManualIssues] = useState<FollowUpIssueItem[]>([]);
  const [, setLoading] = useState(true);

  // 引入其他模組資料
  const ncrList = useNCRStore(state => state.ncrList);
  const obsList = useOBSStore(state => state.obsList);
  const noiList = useNOIStore(state => state.noiList);
  const itrList = useITRStore(state => state.itrList);
  const itpList = useITPStore(state => state.itpList);
  const pqpList = usePQPStore(state => state.pqpList);

  const fetchManualIssues = async () => {
    setLoading(true);
    try {
      const res = await api.get('/followup/');
      setManualIssues(res.data);
    } catch (err) {
      console.error('Failed to fetch issues:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManualIssues();
  }, []);

  // 合併所有 Open 狀態的項目
  const issues = useMemo(() => {
    const externalItems: FollowUpIssueItem[] = [];

    // NCR Open items
    ncrList.filter(n => n.status.toLowerCase() === 'open' || n.status.toLowerCase() === 'opening').forEach(n => {
      externalItems.push({
        id: `ncr-${n.id}`,
        issueNo: n.documentNumber,
        title: n.subject || n.description || 'NCR Issue',
        description: n.description || '',
        status: n.status,
        priority: 'Medium',
        assignedTo: n.raisedBy || '',
        vendor: n.vendor,
        dueDate: n.dueDate || '',
        createdAt: n.raiseDate || '',
        updatedAt: '',
        sourceModule: 'NCR',
        sourceReferenceNo: n.documentNumber,
        isExternal: true,
      });
    });

    // OBS Open items
    obsList.filter(o => (o.status || '').toLowerCase() !== 'closed').forEach(o => {
      externalItems.push({
        id: `obs-${o.id}`,
        issueNo: o.documentNumber,
        title: o.description || 'OBS Issue',
        description: o.description || '',
        status: o.status || 'Open',
        priority: 'Medium',
        assignedTo: '',
        vendor: o.vendor,
        dueDate: '',
        createdAt: o.raiseDate || '',
        updatedAt: '',
        sourceModule: 'OBS',
        sourceReferenceNo: o.documentNumber,
        isExternal: true,
      });
    });

    // NOI Open items
    noiList.filter(n => (n.status || 'Open').toLowerCase() !== 'closed').forEach(n => {
      externalItems.push({
        id: `noi-${n.id}`,
        issueNo: n.referenceNo,
        title: n.checkpoint || 'NOI Issue',
        description: n.remark || '',
        status: n.status || 'Open',
        priority: 'Medium',
        assignedTo: '',
        vendor: n.contractor,
        dueDate: '',
        createdAt: n.issueDate || '',
        updatedAt: '',
        sourceModule: 'NOI',
        sourceReferenceNo: n.referenceNo,
        isExternal: true,
      });
    });

    // ITR Pending items
    itrList.filter(i => i.status.toLowerCase() !== 'approved').forEach(i => {
      externalItems.push({
        id: `itr-${i.id}`,
        issueNo: i.documentNumber,
        title: i.subject || i.description || 'ITR Pending',
        description: i.description || '',
        status: i.status,
        priority: 'Medium',
        assignedTo: '',
        vendor: i.vendor,
        dueDate: '',
        createdAt: i.raiseDate || '',
        updatedAt: '',
        sourceModule: 'ITR',
        sourceReferenceNo: i.documentNumber,
        isExternal: true,
      });
    });

    // ITP Pending items
    itpList.filter(i => {
      const s = i.status.toLowerCase();
      return s !== 'approved' && s !== 'approved with comments' && s !== 'void';
    }).forEach(i => {
      externalItems.push({
        id: `itp-${i.id}`,
        issueNo: i.referenceNo || '',
        title: i.description || 'ITP Pending',
        description: i.description || '',
        status: i.status,
        priority: 'Medium',
        assignedTo: '',
        vendor: i.vendor,
        dueDate: '',
        createdAt: i.submissionDate || '',
        updatedAt: '',
        sourceModule: 'ITP',
        sourceReferenceNo: i.referenceNo || '',
        isExternal: true,
      });
    });

    // PQP Pending items
    pqpList.filter(p => (p.status || '').toLowerCase() !== 'approved').forEach(p => {
      externalItems.push({
        id: `pqp-${p.id}`,
        issueNo: p.pqpNo,
        title: p.title || 'PQP Pending',
        description: '',
        status: p.status || 'Pending',
        priority: 'Medium',
        assignedTo: '',
        vendor: p.vendor,
        dueDate: '',
        createdAt: '',
        updatedAt: '',
        sourceModule: 'PQP',
        sourceReferenceNo: p.pqpNo,
        isExternal: true,
      });
    });

    // 合併手動建立的 Follow-up 與外部模組項目
    return [...manualIssues.map(m => ({ ...m, isExternal: false })), ...externalItems];
  }, [manualIssues, ncrList, obsList, noiList, itrList, itpList, pqpList]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [currentIssueId, setCurrentIssueId] = useState<string | null>(null);
  const [viewingIssueId, setViewingIssueId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  const filteredList = useMemo(() => {
    let result = [...issues];

    if (statusFilter !== 'all') {
      result = result.filter(issue => {
        const s = (issue.status || '').toLowerCase();
        return statusFilter === 'closed' ? s === 'closed' : s !== 'closed';
      });
    }

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(issue =>
        (issue.issueNo && issue.issueNo.toLowerCase().includes(lowerQuery)) ||
        (issue.title && issue.title.toLowerCase().includes(lowerQuery)) ||
        (issue.description && issue.description.toLowerCase().includes(lowerQuery)) ||
        (issue.status && issue.status.toLowerCase().includes(lowerQuery)) ||
        (issue.assignedTo && issue.assignedTo.toLowerCase().includes(lowerQuery)) ||
        (issue.vendor && issue.vendor.toLowerCase().includes(lowerQuery))
      );
    }

    return result;
  }, [issues, searchQuery, statusFilter]);

  const statistics = useFollowUpIssueStats(issues);

  const handleEdit = (id: string) => {
    setCurrentIssueId(id);
    setIsEditModalOpen(true);
  };



  const handleAddNew = () => {
    setCurrentIssueId(null);
    setIsEditModalOpen(true);
  };

  const handleSaveIssueDetails = async (updates: Partial<FollowUpIssueItem>) => {
    try {
      if (currentIssueId) {
        // Update existing
        await api.put(`/followup/${currentIssueId}`, updates);
      } else {
        // Create new
        const today = new Date().toISOString().split('T')[0];
        const newIssue = {
          ...updates,
          createdAt: today,
          updatedAt: today,
          title: updates.title || 'New Issue',
          status: updates.status || 'Open',
          description: updates.description || ''
        };
        await api.post('/followup/', newIssue);
      }
      fetchManualIssues();
    } catch (err) {
      console.error('Failed to save issue:', err);
      toast.error(t('common.saveFailed') || '儲存失敗');
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeleteModal({ isOpen: true, id, message: '確定要刪除此問題嗎？' });
  };

  const handleDeleteConfirm = async () => {
    if (deleteModal.id) {
      try {
        await api.delete(`/followup/${deleteModal.id}`);
        fetchManualIssues();
        setDeleteModal({ isOpen: false, id: null, message: '' });
      } catch (err) {
        console.error('Failed to delete issue:', err);
        toast.error(t('common.deleteFailed') || '刪除失敗');
      }
    }
  };

  const chips: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: t('common.all') || 'All', count: statistics.total },
    { id: 'open', label: t('status.open') || 'Open', count: statistics.opening },
    { id: 'closed', label: t('status.closed') || 'Closed', count: statistics.closed },
  ];

  const summary = [
    {
      key: 'open',
      label: t('status.open') || 'Open',
      value: statistics.opening,
      icon: <Clock size={18} strokeWidth={1.8} />,
      accent: '#c8753f',
    },
    {
      key: 'closed',
      label: t('status.closed') || 'Closed',
      value: statistics.closed,
      icon: <CheckCircle2 size={18} strokeWidth={1.8} />,
      accent: '#7a8f5a',
    },
    {
      key: 'total',
      label: t('common.total') || 'Total',
      value: statistics.total,
      icon: <BarChart3 size={18} strokeWidth={1.8} />,
      accent: '#8a6a3a',
    },
    {
      key: 'rate',
      label: t('noi.stats.openRate') || 'Open Rate',
      value: `${statistics.openRate}%`,
      icon: <DonutGauge percent={statistics.openRate} />,
      accent: '#b8945a',
    },
  ];

  return (
    <div className={shellStyles.container}>
      <section className={shellStyles.summaryGrid}>
        {summary.map((card) => (
          <div
            key={card.key}
            className={shellStyles.summaryCard}
            style={{ '--accent': card.accent } as React.CSSProperties}
          >
            <div className={shellStyles.summaryIcon}>{card.icon}</div>
            <div className={shellStyles.summaryBody}>
              <div className={shellStyles.summaryLabel}>{card.label}</div>
              <div className={shellStyles.summaryValue}>{card.value}</div>
            </div>
          </div>
        ))}
      </section>

      <div className={shellStyles.toolbar}>
        <div className={shellStyles.chipGroup}>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`${shellStyles.chip} ${statusFilter === chip.id ? shellStyles.chipActive : ''}`}
              onClick={() => setStatusFilter(chip.id)}
            >
              {chip.label}
              <span className={shellStyles.chipCount}>{chip.count}</span>
            </button>
          ))}
        </div>
        <div className={shellStyles.toolbarRight}>
          <div className={shellStyles.searchWrap}>
            <Search size={15} className={shellStyles.searchIcon} strokeWidth={2} />
            <input
              type="text"
              className={shellStyles.searchInput}
              placeholder={t('common.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button type="button" className={shellStyles.addNewButton} onClick={handleAddNew}>
            {t('followup.addNew')}
          </button>
        </div>
      </div>

      <div className={shellStyles.content}>
        <DataTable
          columns={createColumns(handleDeleteClick, navigate, t)}
          data={filteredList}
          searchKey=""
          getRowClassName={(row) =>
            (row.status || '').toLowerCase() === 'closed' ? shellStyles.rowDim : ''
          }
          onRowClick={(row) => handleEdit(row.id)}
        />
      </div>

      {isEditModalOpen && (
        <FollowUpIssueDetailModal
          issueId={currentIssueId || 'new'}
          existingItem={currentIssueId ? issues.find(item => item.id === currentIssueId) : undefined}
          onSave={handleSaveIssueDetails}
          onClose={() => {
            setIsEditModalOpen(false);
            setCurrentIssueId(null);
          }}
        />
      )}

      {isDetailsModalOpen && viewingIssueId && (
        <FollowUpIssueDetailsViewModal
          issueId={viewingIssueId}
          issueItem={issues.find(item => item.id === viewingIssueId)}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setViewingIssueId(null);
          }}
        />
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDeleteTitle')}
        message={deleteModal.message || t('common.confirmDelete')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />
    </div>
  );
};

interface FollowUpIssueDetailModalProps {
  issueId: string;
  existingItem?: FollowUpIssueItem;
  onSave: (updates: Partial<FollowUpIssueItem>) => void;
  onClose: () => void;
}

const FollowUpIssueDetailModal: React.FC<FollowUpIssueDetailModalProps> = ({ existingItem, onSave, onClose }) => {
  const { t } = useLanguage();
  const { getActiveContractors } = useContractorsStore();
  const contractors = getActiveContractors();

  const ncrList = useNCRStore(state => state.ncrList);
  const obsList = useOBSStore(state => state.obsList);
  const noiList = useNOIStore(state => state.noiList);
  const itrList = useITRStore(state => state.itrList);
  const itpList = useITPStore(state => state.itpList);
  const pqpList = usePQPStore(state => state.pqpList);
  const [formData, setFormData] = useState<Partial<FollowUpIssueItem>>({
    issueNo: existingItem?.issueNo || '',
    title: existingItem?.title || '',
    description: existingItem?.description || '',
    status: existingItem?.status || 'Open',
    assignedTo: existingItem?.assignedTo || '',
    vendor: existingItem?.vendor || '',
    dueDate: existingItem?.dueDate || '',
    action: existingItem?.action || '',
  });
  // ... rest of modal logic
  const actionTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFieldChange = (field: keyof FollowUpIssueItem, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleInsertDate = () => {
    const textarea = actionTextareaRef.current;
    if (!textarea) return;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const dateWithUnderscore = today + '_'; // 日期後添加下底線
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = formData.action || '';

    // 在游標位置插入日期和下底線
    const newValue = currentValue.substring(0, start) + dateWithUnderscore + currentValue.substring(end);

    setFormData(prev => ({ ...prev, action: newValue }));

    // 設置游標位置到插入日期和下底線之後
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + dateWithUnderscore.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleSave = async () => {
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      toast.error((err as Error)?.message || 'Save failed');
    }
  };

  return (
    <div className={formStyles.modalOverlay}>
      <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={formStyles.modalHeader}>
          <h2>{existingItem ? t('followup.editTitle') : t('followup.addTitle')}</h2>
          <button className={formStyles.closeButton} onClick={onClose}>×</button>
        </div>
        <div className={formStyles.modalBody}>
          <div className={formStyles.formSections}>
            <div className={formStyles.formSection}>
              <h3 className={formStyles.sectionTitle}>{t('common.baseInfo')}</h3>
              <div className={formStyles.formGrid}>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.issueNo')}</label>
                  <input
                    type="text"
                    className={formStyles.formInput}
                    value={formData.issueNo || t('form.autoGenerated')}
                    readOnly
                    style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: formData.issueNo ? '#000000' : '#666666' }}
                  />
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.status')}</label>
                  <select
                    className={formStyles.formSelect}
                    value={formData.status || 'Open'}
                    onChange={(e) => handleFieldChange('status', e.target.value)}
                  >
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.assignedTo')}</label>
                  <input
                    type="text"
                    className={formStyles.formInput}
                    value={formData.assignedTo || ''}
                    onChange={(e) => handleFieldChange('assignedTo', e.target.value)}
                  />
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.vendor')}</label>
                  <select
                    className={formStyles.formSelect}
                    value={formData.vendor || ''}
                    onChange={(e) => handleFieldChange('vendor', e.target.value)}
                  >
                    <option value="">-- {t('common.selectContractor')} --</option>
                    {contractors.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.sourceModule')}</label>
                  <select
                    className={formStyles.formSelect}
                    value={formData.sourceModule || ''}
                    onChange={(e) => handleFieldChange('sourceModule', e.target.value)}
                  >
                    <option value="">-- {t('common.selectPlaceholder')} --</option>
                    <option value="NCR">NCR</option>
                    <option value="OBS">OBS</option>
                    <option value="NOI">NOI</option>
                    <option value="ITR">ITR</option>
                    <option value="ITP">ITP</option>
                    <option value="PQP">PQP</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.sourceRef')}</label>
                  {formData.sourceModule && formData.sourceModule !== 'Other' ? (
                    <select
                      className={formStyles.formSelect}
                      value={formData.sourceReferenceNo || ''}
                      onChange={(e) => handleFieldChange('sourceReferenceNo', e.target.value)}
                    >
                      <option value="">-- {t('common.selectPlaceholder')} --</option>
                      {formData.sourceModule === 'NCR' && ncrList.map((n: any) => <option key={n.id} value={n.referenceNo || n.documentNumber}>{n.referenceNo || n.documentNumber}</option>)}
                      {formData.sourceModule === 'OBS' && obsList.map((o: any) => <option key={o.id} value={o.referenceNo || o.documentNumber}>{o.referenceNo || o.documentNumber}</option>)}
                      {formData.sourceModule === 'NOI' && noiList.map((n: any) => <option key={n.id} value={n.referenceNo || n.documentNumber}>{n.referenceNo || n.documentNumber}</option>)}
                      {formData.sourceModule === 'ITR' && itrList.map((i: any) => <option key={i.id} value={i.referenceNo || i.documentNumber}>{i.referenceNo || i.documentNumber}</option>)}
                      {formData.sourceModule === 'ITP' && itpList.map((i: any) => <option key={i.id} value={i.referenceNo || i.documentNumber}>{i.referenceNo || i.documentNumber}</option>)}
                      {formData.sourceModule === 'PQP' && pqpList.map((p: any) => <option key={p.id} value={p.referenceNo || p.documentNumber}>{p.referenceNo || p.documentNumber}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className={formStyles.formInput}
                      value={formData.sourceReferenceNo || ''}
                      onChange={(e) => handleFieldChange('sourceReferenceNo', e.target.value)}
                      placeholder={formData.sourceModule === 'Other' ? "Enter external reference..." : "Select source module first"}
                      disabled={!formData.sourceModule}
                    />
                  )}
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.createdDate')}</label>
                  <input
                    type={existingItem?.createdAt ? 'date' : 'text'}
                    placeholder="mm/dd/yyyy"
                    lang="en"
                    onFocus={(e) => (e.target.type = 'date')}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = 'text';
                    }}
                    className={formStyles.formInput}
                    value={existingItem?.createdAt || ''}
                    readOnly
                    style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                  />
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.dueDate')}</label>
                  <input
                    type={formData.dueDate ? 'date' : 'text'}
                    placeholder="mm/dd/yyyy"
                    lang="en"
                    onFocus={(e) => (e.target.type = 'date')}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = 'text';
                    }}
                    className={formStyles.formInput}
                    value={formData.dueDate || ''}
                    onChange={(e) => handleFieldChange('dueDate', e.target.value)}
                  />
                </div>
                <div className={formStyles.formGroupFull}>
                  <label>{t('followup.description')}</label>
                  <textarea
                    className={formStyles.formTextarea}
                    value={formData.description || ''}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    rows={4}
                  />
                </div>
                <div className={formStyles.formGroupFull}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label>{t('followup.action')}</label>
                    <button
                      type="button"
                      onClick={handleInsertDate}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#45a049';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#4CAF50';
                      }}
                    >
                      {t('common.addDate')}
                    </button>
                  </div>
                  <textarea
                    ref={actionTextareaRef}
                    className={formStyles.formTextarea}
                    value={formData.action || ''}
                    onChange={(e) => handleFieldChange('action', e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={formStyles.modalActions}>
          <button className={formStyles.saveButton} onClick={handleSave}>
            {t('common.save')}
          </button>
          <button className={formStyles.cancelButton} onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

interface FollowUpIssueDetailsViewModalProps {
  issueId: string;
  issueItem?: FollowUpIssueItem;
  onClose: () => void;
}

const FollowUpIssueDetailsViewModal: React.FC<FollowUpIssueDetailsViewModalProps> = ({ issueItem, onClose }) => {
  const { t } = useLanguage();
  const handlePrint = () => {
    window.print();
  };

  if (!issueItem) {
    return null;
  }

  return (
    <div className={formStyles.modalOverlay}>
      <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={formStyles.modalHeader}>
          <h2>{t('followup.detailsTitle')}</h2>
          <button className={formStyles.closeButton} onClick={onClose}>×</button>
        </div>
        <div className={formStyles.modalBody}>
          <div className={formStyles.formSections}>
            <div className={formStyles.formSection}>
              <h3 className={formStyles.sectionTitle}>{t('common.baseInfo')}</h3>
              <div className={formStyles.formGrid}>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.issueNo')}</label>
                  <div className={formStyles.readOnlyField}>{issueItem.issueNo || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.status')}</label>
                  <div className={formStyles.readOnlyField}>{issueItem.status || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.assignedTo')}</label>
                  <div className={formStyles.readOnlyField}>{issueItem.assignedTo || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.createdDate')}</label>
                  <div className={formStyles.readOnlyField}>{issueItem.createdAt || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.dueDate')}</label>
                  <div className={formStyles.readOnlyField}>{issueItem.dueDate || '-'}</div>
                </div>
                <div className={formStyles.formGroupFull}>
                  <label>{t('followup.description')}</label>
                  <div className={formStyles.readOnlyField}>{issueItem.description || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('followup.action')}</label>
                  <div className={formStyles.readOnlyField}>{issueItem.action || '-'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={formStyles.modalActions}>
          <button className={formStyles.printButton} onClick={handlePrint}>
            {t('common.print')}
          </button>
          <button className={formStyles.cancelButton} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FollowUpIssue;
