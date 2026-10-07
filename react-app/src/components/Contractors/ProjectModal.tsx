import { useLanguage } from '../../context/LanguageContext';
import { toast } from 'sonner';
import { useDraftGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useMemo, useState } from 'react';
import { Project } from '../../store/projectStore';
import styles from './ProjectModal.module.css';

interface ProjectModalProps {
  existing?: Project;
  onSave: (data: Omit<Project, 'id' | 'created_at'>) => Promise<void>;
  onClose: () => void;
}

const ProjectModal: React.FC<ProjectModalProps> = ({ existing, onSave, onClose }) => {
  const { t } = useLanguage();
  const initialForm = useMemo(() => ({
    name: existing?.name || '',
    code: existing?.code || '',
    description: existing?.description || '',
    owner: existing?.owner || '',
  }), [existing]);

  const [form, setForm] = useState(initialForm);

  const [isClosing, setIsClosing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try { await onSave(form); }
    catch { toast.error(t('common.saveFailed')); }
    finally { setSaving(false); }
  };

    const leaveGuard = useDraftGuard(form, saving);
  const handleClose = () => leaveGuard.requestClose(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 250); // Match animation duration
  });

  return (
    <div className={`${styles.modalOverlay} ${isClosing ? styles.closing : ''}`} onMouseDown={handleClose}>
      <div 
        className={`${styles.modalContent} ${isClosing ? styles.closingCard : ''}`} 
        onMouseDown={e => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2>{existing ? 'Edit Project' : 'Add Project'}</h2>
          <button className={styles.closeIconBtn} onClick={handleClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Project Name <span className={styles.required}>*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
              placeholder="Enter project name"
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
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Add project description..."
              rows={3}
            />
          </div>
                  <FormActions
                      cancel={<>
                          <button className={actionStyles.secondary} type="button" onClick={handleClose}>
                              Cancel
                          </button>
                      </>}
                      primary={<>
                          <button className={actionStyles.primary} type="submit" disabled={saving}>
                              {existing ? 'Save Changes' : 'Add Project'}
                          </button>
                      </>}
                  />
        </form>
      </div>
    </div>
  );
};

export default ProjectModal;
