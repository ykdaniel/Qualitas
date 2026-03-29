import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { getNamingRules, updateNamingRules, NamingRuleApi } from '../../services/api';
import styles from './DocumentNamingRules.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns, NamingRuleItem } from './columns';
import { BackButton } from '@/components/ui/BackButton';


const DEFAULT_RULE_DEFS = [
  { id: 'itp',       moduleName: 'ITP',              prefix: 'QTS-RKS-[ABBREV]-ITP-', sequenceDigits: 6, descKey: 'namingRules.desc.itp' },
  { id: 'noi',       moduleName: 'NOI',              prefix: 'QTS-RKS-[ABBREV]-NOI-', sequenceDigits: 6, descKey: 'namingRules.desc.noi' },
  { id: 'itr',       moduleName: 'ITR',              prefix: 'QTS-RKS-[ABBREV]-ITR-', sequenceDigits: 6, descKey: 'namingRules.desc.itr' },
  { id: 'ncr',       moduleName: 'NCR',              prefix: 'QTS-RKS-[ABBREV]-NCR-', sequenceDigits: 6, descKey: 'namingRules.desc.ncr' },
  { id: 'obs',       moduleName: 'OBS',              prefix: 'QTS-RKS-[ABBREV]-OBS-', sequenceDigits: 6, descKey: 'namingRules.desc.obs' },
  { id: 'pqp',       moduleName: 'PQP',              prefix: 'QTS-RKS-[ABBREV]-PQP-', sequenceDigits: 6, descKey: 'namingRules.desc.pqp' },
  { id: 'followup',  moduleName: 'Follow up Issue',  prefix: 'QTS-RKS-[ABBREV]-FUI-', sequenceDigits: 6, descKey: 'namingRules.desc.followup' },
  { id: 'fat',       moduleName: 'FAT',              prefix: 'QTS-RKS-[ABBREV]-FAT-', sequenceDigits: 6, descKey: 'namingRules.desc.fat' },
  { id: 'audit',     moduleName: 'Audit',            prefix: 'QTS-RKS-[ABBREV]-AUD-', sequenceDigits: 6, descKey: 'namingRules.desc.audit' },
  { id: 'checklist', moduleName: 'Checklist',        prefix: 'QTS-RKS-[ABBREV]-CHK-', sequenceDigits: 6, descKey: 'namingRules.desc.checklist' },
];



const DocumentNamingRules: React.FC = () => {
  const { t } = useLanguage();

  const buildDefaultRules = (): NamingRuleItem[] =>
    DEFAULT_RULE_DEFS.map((def) => ({ ...def, description: t(def.descKey) }));

  const [rules, setRules] = useState<NamingRuleItem[]>(buildDefaultRules);
  const [saved, setSaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  const rulesWithDescription = rules.map((rule) => {
    const def = DEFAULT_RULE_DEFS.find((item) => item.id === rule.id);
    return {
      ...rule,
      description: def ? t(def.descKey) : rule.description,
    };
  });

  const filteredRules = rulesWithDescription.filter(rule =>
    rule.moduleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rule.prefix.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rule.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const fetchRules = async () => {
      try {
        setLoadError('');
        const apiRules: NamingRuleApi[] = await getNamingRules();
        const map = new Map<string, NamingRuleApi>();
        apiRules.forEach((r) => {
          map.set(r.doc_type.toLowerCase(), r);
        });
        setRules(
          DEFAULT_RULE_DEFS.map((def) => {
            const apiRule = map.get(def.id.toLowerCase());
            return {
              ...def,
              description: '',
              prefix: apiRule ? apiRule.prefix : def.prefix,
              sequenceDigits: apiRule ? apiRule.sequence_digits : def.sequenceDigits,
            };
          })
        );
      } catch (e) {
        const err = e as { response?: { data?: { detail?: string } }; message?: string };
        const msg = err.response?.data?.detail ?? err.message ?? 'Failed to load document naming rules.';
        setLoadError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
    };

    fetchRules();
  }, []);

  const handlePrefixChange = (id: string, value: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, prefix: value } : r));
    setSaved(false);
  };

  const handleSequenceDigitsChange = (id: string, value: number) => {
    const n = Math.max(1, Math.min(6, Math.floor(value) || 1));
    setRules(prev => prev.map(r => r.id === id ? { ...r, sequenceDigits: n } : r));
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      setSaveError('');
      const payload = rules.map((rule) => ({
        doc_type: rule.id,
        prefix: rule.prefix ?? '',
        sequence_digits: Math.min(6, Math.max(1, Number(rule.sequenceDigits) || 6)),
      }));
      await updateNamingRules(payload);
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
    }
  };

  const getExample = (rule: NamingRuleItem): string => {
    const seq = String(1).padStart(rule.sequenceDigits, '0');
    return rule.prefix.replace('[ABBREV]', 'A') + seq;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1 className={styles.title}>{t('namingRules.title')}</h1>
          <p className={styles.subtitle}>{t('namingRules.subtitle')}</p>
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

      <div className={styles.card}>
        {loadError && <p className={styles.errorText}>{loadError}</p>}
        {saveError && <p className={styles.errorText}>{saveError}</p>}
        <div className={styles.tableWrap}>
          <DataTable
            title={t('namingRules.title')}
            actions={
              <button className={styles.saveButton} onClick={handleSave}>
                {saved ? t('namingRules.saved') : t('namingRules.save')}
              </button>
            }
            columns={createColumns(handlePrefixChange, handleSequenceDigitsChange, getExample, t)}
            data={filteredRules}
            searchKey=""
            getRowId={(row) => row.id}
          />
        </div>
        <p className={styles.hint}>
          <strong>{t('namingRules.hint')}：</strong> {t('namingRules.hintContent')}
        </p>
      </div>
    </div>
  );
};

export default DocumentNamingRules;
