import { useLeaveGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { materialText } from '../MaterialSubmittal/materialText';
import { getNamingRules, updateNamingRules } from '../../services/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  buildRules, changedRules, exampleNumber, EXAMPLE_PROJECT, NamingRuleChange, NamingRuleValue, PageRule, prefixProblem, RuleDisplay, toPayload,
} from './namingRules';
import { useProjectStore } from '../../store/projectStore';
import styles from './DocumentNamingRules.module.css';

// How the page shows the doc types it knows, in page order (NAMING-RULES-CLEANUP-2026-001). Which rules exist and their
// values come from the backend (routers/settings.py DEFAULT_NAMING_RULES, seeded on GET); a type the backend has that
// is missing here is still shown, after these, under its code (see buildRules).
const RULE_DISPLAYS: RuleDisplay[] = [
  { id: 'itp',       moduleName: 'ITP' },
  { id: 'noi',       moduleName: 'NOI' },
  { id: 'itr',       moduleName: 'ITR' },
  { id: 'ncr',       moduleName: 'NCR' },
  { id: 'obs',       moduleName: 'OBS' },
  { id: 'pqp',       moduleName: 'PQP' },
  { id: 'followup',  moduleName: 'Follow up Issue',  nameKey: 'followup.title' },
  { id: 'fat',       moduleName: 'FAT',              noteKey: 'namingRules.note.fat', unused: true },
  { id: 'audit',     moduleName: 'Audit',            nameKey: 'audit.title' },
  { id: 'checklist', moduleName: 'Checklist' },
  { id: 'osd',       moduleName: 'OSD' },
  { id: 'meeting',   moduleName: 'Meeting Minutes',  nameKey: 'meetingMinutes.title', noteKey: 'namingRules.note.meeting' },
  // MATERIAL-SUBMITTAL: its name comes from the module's own text file, not from LanguageContext (see materialText.ts)
  { id: 'msa',       moduleName: 'Material' },
];

const toValues = (rules: NamingRuleValue[]): NamingRuleValue[] =>
  rules.map(({ id, prefix, sequenceDigits }) => ({ id, prefix, sequenceDigits }));

const DocumentNamingRules: React.FC = () => {
  const { t, language } = useLanguage();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('settings:manage:all');
  // examples show the current project's code (REF-PROJECT-SEQ-2026-001 B3); ABC in "All projects"
  const exampleCode = useProjectStore(state => state.currentProject?.code) || EXAMPLE_PROJECT;

  const [rules, setRules] = useState<PageRule[]>([]);   // nothing until the backend has answered
  const [savedRules, setSavedRules] = useState<NamingRuleValue[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<NamingRuleChange<PageRule>[] | null>(null);
  const changes = savedRules ? changedRules(savedRules, rules) : [];
  useLeaveGuard(changes.length > 0, saving);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        setLoadError('');
        const loadedRules = buildRules(RULE_DISPLAYS, await getNamingRules());
        setRules(loadedRules);
        setSavedRules(toValues(loadedRules));
      } catch (e) {
        const err = e as { response?: { data?: { detail?: string } }; message?: string };
        const msg = err.response?.data?.detail ?? err.message ?? 'Failed to load document naming rules.';
        setLoadError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
    };

    fetchRules();
  }, []);

  const moduleLabel = (rule: RuleDisplay): string => {
    if (rule.id === 'msa') return materialText(language, 'title');
    return rule.nameKey ? t(rule.nameKey) : rule.moduleName;
  };

  const handlePrefixChange = (id: string, value: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, prefix: value } : r));
    setSaved(false);
  };

  const handleSequenceDigitsChange = (id: string, value: number) => {
    const n = Math.max(1, Math.min(6, Math.floor(value) || 1));
    setRules(prev => prev.map(r => r.id === id ? { ...r, sequenceDigits: n } : r));
    setSaved(false);
  };

  // Validates, then asks for confirmation: a naming change has a wide blast radius (every module's document
  // numbering reads it) and its effect is easy to misread, so the dialog spells out before → after and the impact.
  const handleSave = () => {
    if (saving || savedRules === null || changes.length === 0) return;
    setSaveError('');

    // An unused rule cannot be edited here, so its stored value must not be able to block saving the others.
    const editable = rules.filter((r) => !r.unused);
    // the same checks as the backend (routers/settings.py): [PROJECT] required, [ABBREV] refused, KM exempt
    const PROBLEM_TEXT = {
      empty: t('namingRules.errorEmptyPrefix') || 'Prefix cannot be empty.',
      project: t('namingRules.errorMissingProject'),
      abbrev: t('namingRules.errorAbbrevRetired'),
    };
    for (const rule of editable) {
      const problem = prefixProblem(rule.id, rule.prefix);
      if (problem) {
        setSaveError(`${moduleLabel(rule)}: ${PROBLEM_TEXT[problem]}`);
        return;
      }
    }
    const seenPrefixes = new Map<string, string>();
    for (const rule of rules) {
      const prefix = rule.prefix.trim();  // the backend compares trimmed prefixes too
      const existing = seenPrefixes.get(prefix);
      if (existing) {
        setSaveError(
          `${existing} ${t('namingRules.errorDuplicatePrefix') || 'and'} ${moduleLabel(rule)} ${t('namingRules.errorDuplicatePrefixSuffix') || 'have the same prefix — document numbers would collide.'}`
        );
        return;
      }
      seenPrefixes.set(prefix, moduleLabel(rule));
    }

    setPendingChanges(changes);
  };

  // The dialog closes before the request goes out, so nothing covers the page while saving: the leave guard can
  // then block an in-app navigation during the save and let it continue once the save has finished.
  const handleConfirmSave = async () => {
    setPendingChanges(null);
    setSaving(true);
    try {
      // what the backend stored (prefixes trimmed) becomes the page's state, so the page shows exactly the saved rules
      const storedRules = buildRules(RULE_DISPLAYS, await updateNamingRules(toPayload(rules)));
      setRules(storedRules);
      setSavedRules(toValues(storedRules));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      const status = err.response?.status;
      if (status === 403) {
        setSaveError(t('common.permissionDenied') || '您沒有權限修改命名規則（需要 settings:manage:all）');
      } else {
        const msg = err.response?.data?.detail ?? err.message ?? '請確認後端已啟動且網路連線正常。';
        setSaveError(`命名規則儲存失敗：${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
      }
    } finally { setSaving(false); }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{t('namingRules.title')}</h1>
          <p className={styles.subtitle}>{t('namingRules.subtitle')}</p>
        </div>
      </div>

      <div className={styles.card}>
        {loadError && <p className={styles.errorText}>{loadError}</p>}
        {saveError && <p className={styles.errorText}>{saveError}</p>}
        <p className={styles.infoText}>{t('namingRules.autoAdded')}</p>
        {!canEdit && <p className={styles.readOnlyText}>{t('namingRules.readOnly')}</p>}
        <fieldset disabled={saving || savedRules === null || !canEdit || pendingChanges !== null} className={styles.tableWrap}>
          <div className={styles.tableBorder}>
            <Table className={styles.table}>
              <TableHeader>
                <TableRow>
                  <TableHead className={styles.colModule}>{t('namingRules.module')}</TableHead>
                  <TableHead className={styles.colPrefix}>{t('namingRules.prefixFormat')}</TableHead>
                  <TableHead className={styles.colDigits}>{t('namingRules.sequenceDigits')}</TableHead>
                  <TableHead className={styles.colExample}>{t('namingRules.example')}</TableHead>
                  <TableHead>{t('namingRules.description')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savedRules === null && !loadError && (
                  <TableRow>
                    <TableCell colSpan={5} className={styles.loadingCell}>{t('common.loading')}</TableCell>
                  </TableRow>
                )}
                {rules.map((rule) => (
                  <TableRow key={rule.id} className={rule.unused ? styles.unusedRow : undefined}>
                    <TableCell className={styles.moduleCell}>{moduleLabel(rule)}</TableCell>
                    <TableCell>
                      <input
                        type="text"
                        className={styles.prefixInput}
                        value={rule.prefix}
                        disabled={rule.unused}
                        onChange={(e) => handlePrefixChange(rule.id, e.target.value)}
                        placeholder="e.g. QTS-RKS-[PROJECT]-NCR-"
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="number"
                        className={styles.digitsInput}
                        min={1}
                        max={6}
                        value={rule.sequenceDigits}
                        disabled={rule.unused}
                        onChange={(e) => handleSequenceDigitsChange(rule.id, Number(e.target.value))}
                      />
                    </TableCell>
                    <TableCell><span className={styles.example}>{exampleNumber(rule.prefix, rule.sequenceDigits, exampleCode)}</span></TableCell>
                    <TableCell className={styles.noteCell}>{rule.noteKey ? t(rule.noteKey) : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </fieldset>
        <FormActions primary={canEdit ? (
          <button className={actionStyles.primary} onClick={handleSave} disabled={saving || savedRules === null || changes.length === 0}>
            {saved ? t('namingRules.saved') : t('namingRules.save')}
          </button>
        ) : null} />
        <p className={styles.hint}>
          <strong>{t('namingRules.hint')}：</strong> {t('namingRules.hintContentProject')}
        </p>
      </div>

      {pendingChanges && (
        <div className={styles.modalOverlay} onClick={() => setPendingChanges(null)} onKeyDown={(e) => { if (e.key === 'Escape') setPendingChanges(null); }}>
          <div className={styles.modal} role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="naming-confirm-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="naming-confirm-title" className={styles.modalTitle}>{t('namingRules.confirmTitle')}</h2>
            <p className={styles.modalText}>{t('namingRules.confirmIntro')}</p>
            <ul className={styles.changeList}>
              {pendingChanges.map(({ rule, before }) => (
                <li key={rule.id}>
                  <strong>{moduleLabel(rule)}</strong>
                  <span className={styles.example}>{exampleNumber(before.prefix, before.sequenceDigits, exampleCode)}</span>
                  →
                  <span className={styles.example}>{exampleNumber(rule.prefix, rule.sequenceDigits, exampleCode)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.modalText}>{t('namingRules.confirmImpact')}</p>
            <FormActions
              cancel={
                <button type="button" className={actionStyles.secondary} autoFocus onClick={() => setPendingChanges(null)}>
                  {t('common.cancel')}
                </button>
              }
              primary={
                <button type="button" className={actionStyles.primary} onClick={handleConfirmSave}>
                  {t('namingRules.confirmSave')}
                </button>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentNamingRules;
