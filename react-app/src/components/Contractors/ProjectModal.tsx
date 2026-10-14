import { useLanguage } from '../../context/LanguageContext';
import { toast } from 'sonner';
import { useDraftGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useMemo, useState } from 'react';
import { Project } from '../../store/projectStore';
import { showRefusal } from '../../store/refusalStore';
import styles from './ProjectModal.module.css';

// Every document number of a project carries its code: QTS-RKS-<code>-NOI-000001 (REF-PROJECT-SEQ-2026-001 B3, D14).
// The server checks the same rules (and uniqueness); STD is the code of shared templates.
const PROJECT_CODE_PATTERN = /^[A-Z0-9]{2,8}$/;
const RESERVED_PROJECT_CODE = 'STD';

export const projectCodeProblem = (code: string): string | null => {
  if (!code) return 'Enter a project code.';
  if (!PROJECT_CODE_PATTERN.test(code)) return 'Use 2 to 8 letters or digits.';
  if (code === RESERVED_PROJECT_CODE) return 'STD is reserved for shared templates.';
  return null;
};

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

  const codeProblem = projectCodeProblem(form.code);
  const codeChanged = !!existing?.code && form.code !== existing.code;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || codeProblem) return;
    setSaving(true);
    try { await onSave(form); }
    catch (err: any) {
      // a coded refusal (e.g. PROJECT_CODE_DUPLICATE) shows its reason in the refusal dialog
      console.error('Saving the project failed:', err);
      if (err?.response?.data?.code) showRefusal(err, 'save');
      else toast.error(t('common.saveFailed'));
    }
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
            <label>Project Code <span className={styles.required}>*</span></label>
            <input
              type="text"
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value.toUpperCase().trim() })}
              required
              maxLength={8}
              placeholder="e.g. HL, YL, GCH"
            />
            <small>
              {form.code && codeProblem
                ? codeProblem
                : `Every document number of this project carries it: QTS-RKS-${form.code || '<code>'}-NOI-000001. Set it once; do not change it after documents exist.`}
            </small>
            {codeChanged && !codeProblem && (
              <small>Changing the code: new documents get the new code and continue the project's numbering; numbers already issued keep the old code.</small>
            )}
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
                          <button className={actionStyles.primary} type="submit" disabled={saving || !!codeProblem}>
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
