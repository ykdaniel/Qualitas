import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { createContractorPersonnel, getPersonnelOptions, type PersonnelOptionApi } from '../../services/api';
import { useContractorsStore, type ContractorOption } from '../../store/contractorsStore';
import type { Attendee } from '../../store/meetingMinutesStore';
import formStyles from '../Shared/FormShell.module.css';

interface Props {
    value: Attendee;
    onChange: (a: Attendee) => void;
    /** adds the attendee to the meeting (the snapshot texts plus the ids when picked from a list) */
    onAdd: (a: Attendee) => void;
    /** <datalist> id with the names offered when the company is not one on the contractor list */
    fallbackPeopleListId: string;
}

/** The text a company is shown and printed as: its abbreviation when it has one (the company minutes write "TECO", "HL"). */
export const companyLabel = (c: ContractorOption) => c.abbreviation || c.name;

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Attendee entry (CONTRACTOR-PERSONNEL-2026-001, user 2026-10-11: "這裡要從contractor 內取得資料"): pick the company from
 * the contractor list (own company and the owner are on it too — user's choice), then one of its active people; the
 * position comes with them. Anyone not on the list can still be typed, and — for users who manage contractors — put
 * on that company's list at the same time. What is stored is a snapshot of the texts (plus the ids), so a later rename
 * or deactivation never changes these minutes.
 */
const AttendeePicker: React.FC<Props> = ({ value, onChange, onAdd, fallbackPeopleListId }) => {
    const { t } = useLanguage();
    const { hasPermission } = useAuth();
    const canManage = hasPermission('contractors:manage:all');
    const options = useContractorsStore(s => s.options);
    const [people, setPeople] = useState<Record<string, PersonnelOptionApi[]>>({});
    const [addToList, setAddToList] = useState(false);
    const [adding, setAdding] = useState(false);

    const companies = useMemo(() => options.filter(c => c.status === 'active'), [options]);
    // the company typed / picked, if it is one on the list (by its shown text, abbreviation or full name)
    const company = useMemo(() => {
        const text = value.company || '';
        if (!text.trim()) return undefined;
        // active companies only, the ones offered: no one is added to the list of a company that was set inactive
        return companies.find(c => sameText(companyLabel(c), text) || sameText(c.name, text));
    }, [companies, value.company]);
    const companyPeople = company ? people[company.id] : undefined;

    useEffect(() => {
        if (!company || people[company.id]) return;
        let alive = true;
        getPersonnelOptions(company.id)
            .then(list => { if (alive) setPeople(prev => ({ ...prev, [company.id]: list })); })
            .catch(err => console.error('Loading the company personnel failed:', err));
        return () => { alive = false; };
    }, [company, people]);

    const setCompany = (text: string) => {
        // a new company: the picked person and their position no longer apply (the text is kept as typed while typing;
        // it becomes the company's short name when the attendee is added)
        onChange({ ...value, company: text, contractorId: undefined, personnelId: undefined, role: value.personnelId ? '' : value.role });
        setAddToList(false);
    };
    const setName = (text: string) => {
        const person = companyPeople?.find(p => sameText(p.name, text));
        const previous = companyPeople?.find(p => p.id === value.personnelId);
        // the position follows the picked person, unless it was typed over
        const role = person ? (person.position || '') : (previous && value.role === (previous.position || '') ? '' : value.role);
        onChange({ ...value, name: person ? person.name : text, personnelId: person?.id, contractorId: company?.id, role });
    };

    const offerAddToList = canManage && !!company && !!value.name.trim() && !value.personnelId;
    const handleAdd = async () => {
        if (!value.name.trim() || adding) return;
        let added: Attendee = { ...value, name: value.name.trim(), company: company ? companyLabel(company) : (value.company || '').trim(), role: (value.role || '').trim(),
            contractorId: company?.id, personnelId: value.personnelId };
        if (offerAddToList && addToList && company) {
            setAdding(true);
            try {
                const person = await createContractorPersonnel(company.id, { name: added.name, position: added.role });
                added = { ...added, personnelId: person.id };
                setPeople(prev => ({ ...prev, [company.id]: [...(prev[company.id] || []), person] }));
                toast.success(t('meetingMinutes.attendeeListed', { name: added.name, company: added.company || '' }));
            } catch (err) {
                // still an attendee — only the list entry failed
                console.error('Adding to the personnel list failed:', err);
                toast.error(t('meetingMinutes.attendeeListFailed'));
            } finally {
                setAdding(false);
            }
        }
        if (!added.contractorId) delete added.contractorId;
        if (!added.personnelId) delete added.personnelId;
        onAdd(added);
        setAddToList(false);
    };

    const peopleListId = company ? `meeting-company-people-${company.id}` : fallbackPeopleListId;
    return (
        <div data-attendee-picker>
            <div style={{ display: 'flex', gap: 8 }}>
                <input className={formStyles.formInput} list="meeting-attendee-companies" placeholder={t('meetingMinutes.attendeeCompany')}
                    aria-label={t('meetingMinutes.attendeeCompany')} value={value.company || ''} onChange={e => setCompany(e.target.value)} style={{ flex: 1 }} disabled={adding} />
                <input className={formStyles.formInput} list={peopleListId} placeholder={t('meetingMinutes.attendeeName')}
                    aria-label={t('meetingMinutes.attendeeName')} value={value.name} onChange={e => setName(e.target.value)} style={{ flex: 2 }} disabled={adding} />
                <input className={formStyles.formInput} placeholder={t('meetingMinutes.attendeeRole')} aria-label={t('meetingMinutes.attendeeRole')}
                    value={value.role || ''} onChange={e => onChange({ ...value, role: e.target.value })} style={{ flex: 2 }} disabled={adding} />
                <button type="button" onClick={handleAdd} disabled={adding} className={formStyles.printButton} aria-label={t('common.add')}><Plus size={16} /></button>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 24, marginTop: 4, fontSize: 12, color: '#64748b' }}>
                {company && companyPeople && companyPeople.length === 0 && <span data-no-people>{t('meetingMinutes.companyHasNoPeople')}</span>}
                {value.personnelId && <span data-from-list>{t('meetingMinutes.attendeeFromList')}</span>}
                {offerAddToList && (
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', color: '#475569' }}>
                        <input type="checkbox" checked={addToList} onChange={e => setAddToList(e.target.checked)} />
                        {t('meetingMinutes.addToCompanyList', { company: value.company || '' })}
                    </label>
                )}
            </div>
            <datalist id="meeting-attendee-companies">
                {companies.map(c => <option key={c.id} value={companyLabel(c)}>{c.name}</option>)}
            </datalist>
            {company && (
                <datalist id={peopleListId}>
                    {(companyPeople || []).map(p => <option key={p.id} value={p.name}>{p.position || ''}</option>)}
                </datalist>
            )}
        </div>
    );
};

export default AttendeePicker;
