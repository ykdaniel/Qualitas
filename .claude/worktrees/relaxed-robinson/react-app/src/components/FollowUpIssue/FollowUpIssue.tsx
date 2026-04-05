import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useContractors } from '../../context/ContractorsContext';
import { useNCR } from '../../context/NCRContext';
import { useOBS } from '../../context/OBSContext';
import { useNOI } from '../../context/NOIContext';
import { useITR } from '../../context/ITRContext';
import { useITP } from '../../context/ITPContext';
import { usePQP } from '../../context/PQPContext';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './FollowUpIssue.module.css';
import api from '../../services/api';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { BackButton } from '@/components/ui/BackButton';

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
  const [loading, setLoading] = useState(true);

  // 引入其他模組資料
  const { ncrList } = useNCR();
  const { obsList } = useOBS();
  const { noiList } = useNOI();
  const { itrList } = useITR();
  const { itpList } = useITP();
  const { pqpList } = usePQP();

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

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [currentIssueId, setCurrentIssueId] = useState<string | null>(null);
  const [viewingIssueId, setViewingIssueId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  // 先套用日期範圍篩選與全域搜尋
  const filteredList = useMemo(() => {
    let result = [...issues];


    // Global Search
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
  }, [issues, searchQuery]);

  const statistics = useMemo(() => {
    const statusCounts = {
      opening: 0,
      closed: 0,
    };

    issues.forEach((item) => {
      const status = (item.status || 'Open').toLowerCase();
      if (status === 'open') {
        statusCounts.opening++;
      } else if (status === 'closed') {
        statusCounts.closed++;
      }
    });

    const total = issues.length;
    const openRate = total > 0 ? Math.round((statusCounts.opening / total) * 100) : 0;
    const closedRate = total > 0 ? Math.round((statusCounts.closed / total) * 100) : 0;

    return {
      ...statusCounts,
      total,
      openRate,
      closedRate,
    };
  }, [issues]);

  const pieData = useMemo(() => [
    { name: 'Open', value: statistics.opening, color: '#f59e0b' },
    { name: 'Closed', value: statistics.closed, color: '#10b981' },
  ], [statistics.opening, statistics.closed]);

  const handleEdit = (id: string) => {
    setCurrentIssueId(id);
    setIsEditModalOpen(true);
  };

  const handleViewDetails = (id: string) => {
    setViewingIssueId(id);
    setIsDetailsModalOpen(true);
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
      alert('儲存失敗');
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
        alert('刪除失敗');
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1>{t('followup.title')}</h1>
        </div>
        <div className={styles.headerRight}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.summaryRow}>
        <div className={styles.summarySection}>
          <h2 className={styles.summaryTitle}>{t('followup.statsTitle')}</h2>
          <div className={styles.statusStatsGrid}>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.blueIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('status.open')}</div>
                <div className={styles.statValue}>{statistics.opening}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.grayIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('status.closed')}</div>
                <div className={styles.statValue}>{statistics.closed}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.grayIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M18 17V9M12 17V5M6 17v-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('common.total')}</div>
                <div className={styles.statValue}>{statistics.total}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.blueIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('noi.stats.openRate')}</div>
                <div className={styles.statValue}>{statistics.opening} ({statistics.openRate}%)</div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.chartSection}>
          <div className={styles.pieChartInner}>
            {statistics.total > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 4, right: 24, bottom: 4, left: 24 }}>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={64}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ cx, cy, midAngle, outerRadius, name, value, percent }) => {
                      const RADIAN = Math.PI / 180;
                      const extendLen = 14;   // 徑向延伸長度
                      const hLen = 24;       // 水平轉折後長度
                      const sx = cx + outerRadius * Math.cos(-midAngle * RADIAN);
                      const sy = cy + outerRadius * Math.sin(-midAngle * RADIAN);
                      const bx = sx + extendLen * Math.cos(-midAngle * RADIAN);
                      const by = sy + extendLen * Math.sin(-midAngle * RADIAN);
                      const toRight = bx >= cx;
                      const tx = bx + (toRight ? hLen : -hLen);
                      const pct = Math.round((percent ?? 0) * 100);
                      return (
                        <g>
                          <polyline
                            points={`${sx},${sy} ${bx},${by} ${tx},${by}`}
                            fill="none"
                            stroke="#9ca3af"
                            strokeWidth={1}
                          />
                          <text
                            x={tx}
                            y={by}
                            textAnchor={toRight ? 'start' : 'end'}
                            dominantBaseline="middle"
                            fill="#1f2937"
                            fontSize={13}
                            fontWeight={500}
                          >
                            <tspan x={tx} dy="-0.4em" display="block">{name}</tspan>
                            <tspan x={tx} dy="1.2em" fontSize={12} fill="#6b7280" fontWeight={400}>
                              {value} 筆 · {pct}%
                            </tspan>
                          </text>
                        </g>
                      );
                    }}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.pieChartEmpty}>{t('common.noData')}</div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <DataTable
          title={t('followup.listTitle')}
          actions={
            <button
              className={styles.addNewButton}
              onClick={handleAddNew}
            >
              {t('followup.addNew')}
            </button>
          }
          columns={createColumns(handleEdit, handleViewDetails, handleDeleteClick, navigate, t)}
          data={filteredList}
          searchKey=""
          searchPlaceholder={t('common.search')}
          getRowClassName={(row) =>
            (row.status || '').toLowerCase() === 'closed'
              ? 'bg-emerald-100/50 text-gray-500 hover:bg-emerald-200/50'
              : ''
          }
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

const FollowUpIssueDetailModal: React.FC<FollowUpIssueDetailModalProps> = ({ issueId, existingItem, onSave, onClose }) => {
  const { t } = useLanguage();
  const { getActiveContractors } = useContractors();
  const contractors = getActiveContractors();
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

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{existingItem ? t('followup.editTitle') : t('followup.addTitle')}</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formSections}>
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>{t('common.baseInfo')}</h3>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>{t('followup.issueNo')}</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.issueNo || ''}
                    onChange={(e) => handleFieldChange('issueNo', e.target.value)}
                    readOnly={!!existingItem}
                    style={existingItem ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('followup.status')}</label>
                  <select
                    className={styles.formSelect}
                    value={formData.status || 'Open'}
                    onChange={(e) => handleFieldChange('status', e.target.value)}
                  >
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('followup.assignedTo')}</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.assignedTo || ''}
                    onChange={(e) => handleFieldChange('assignedTo', e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('followup.vendor')}</label>
                  <select
                    className={styles.formSelect}
                    value={formData.vendor || ''}
                    onChange={(e) => handleFieldChange('vendor', e.target.value)}
                  >
                    <option value="">-- {t('common.selectContractor')} --</option>
                    {contractors.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('followup.sourceModule')}</label>
                  <select
                    className={styles.formSelect}
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
                <div className={styles.formGroup}>
                  <label>{t('followup.sourceRef')}</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.sourceReferenceNo || ''}
                    onChange={(e) => handleFieldChange('sourceReferenceNo', e.target.value)}
                    placeholder="e.g. NCR-2026-001"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('followup.createdDate')}</label>
                  <input
                    type={existingItem?.createdAt ? 'date' : 'text'}
                    placeholder="mm/dd/yyyy"
                    lang="en"
                    onFocus={(e) => (e.target.type = 'date')}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = 'text';
                    }}
                    className={styles.formInput}
                    value={existingItem?.createdAt || ''}
                    readOnly
                    style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('followup.dueDate')}</label>
                  <input
                    type={formData.dueDate ? 'date' : 'text'}
                    placeholder="mm/dd/yyyy"
                    lang="en"
                    onFocus={(e) => (e.target.type = 'date')}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = 'text';
                    }}
                    className={styles.formInput}
                    value={formData.dueDate || ''}
                    onChange={(e) => handleFieldChange('dueDate', e.target.value)}
                  />
                </div>
                <div className={styles.formGroupFull}>
                  <label>{t('followup.description')}</label>
                  <textarea
                    className={styles.formTextarea}
                    value={formData.description || ''}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    rows={4}
                  />
                </div>
                <div className={styles.formGroupFull}>
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
                    className={styles.formTextarea}
                    value={formData.action || ''}
                    onChange={(e) => handleFieldChange('action', e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.modalActions}>
          <button className={styles.saveButton} onClick={handleSave}>
            {t('common.save')}
          </button>
          <button className={styles.cancelButton} onClick={onClose}>
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

const FollowUpIssueDetailsViewModal: React.FC<FollowUpIssueDetailsViewModalProps> = ({ issueId, issueItem, onClose }) => {
  const { t } = useLanguage();
  const handlePrint = () => {
    window.print();
  };

  if (!issueItem) {
    return null;
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{t('followup.detailsTitle')}</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formSections}>
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>{t('common.baseInfo')}</h3>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>{t('followup.issueNo')}</label>
                  <div className={styles.readOnlyField}>{issueItem.issueNo || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('followup.status')}</label>
                  <div className={styles.readOnlyField}>{issueItem.status || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('followup.assignedTo')}</label>
                  <div className={styles.readOnlyField}>{issueItem.assignedTo || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('followup.createdDate')}</label>
                  <div className={styles.readOnlyField}>{issueItem.createdAt || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('followup.dueDate')}</label>
                  <div className={styles.readOnlyField}>{issueItem.dueDate || '-'}</div>
                </div>
                <div className={styles.formGroupFull}>
                  <label>{t('followup.description')}</label>
                  <div className={styles.readOnlyField}>{issueItem.description || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('followup.action')}</label>
                  <div className={styles.readOnlyField}>{issueItem.action || '-'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.modalActions}>
          <button className={styles.printButton} onClick={handlePrint}>
            {t('common.print')}
          </button>
          <button className={styles.cancelButton} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FollowUpIssue;
