import { useMemo } from 'react';
import { useITPStore } from '../store/itpStore';
import { useNCRStore } from '../store/ncrStore';
import { useNOIStore } from '../store/noiStore';
import { useITRStore } from '../store/itrStore';
import { usePQPStore } from '../store/pqpStore';
import { useOBSStore } from '../store/obsStore';
import { useChecklistStore } from '../store/checklistStore';
import { useLanguage } from '../context/LanguageContext';

export const useDashboardStats = (selectedVendor: string) => {
  const { t } = useLanguage();
  const itpList = useITPStore(state => state.itpList);
  const ncrList = useNCRStore(state => state.ncrList);
  const noiList = useNOIStore(state => state.noiList);
  const itrList = useITRStore(state => state.itrList);
  const pqpList = usePQPStore(state => state.pqpList);
  const obsList = useOBSStore(state => state.obsList);
  const checklistRecords = useChecklistStore(state => state.records);

  const statistics = useMemo(() => {
    const filterByVendor = <T,>(list: T[]): T[] => {
      if (selectedVendor === 'all') return list;
      return list.filter((item: any) =>
        (item.vendor === selectedVendor) ||
        (item.contractor === selectedVendor)
      );
    };

    const filteredItpList = filterByVendor(itpList);
    const filteredNcrList = filterByVendor(ncrList);
    const filteredNoiList = filterByVendor(noiList);
    const filteredItrList = filterByVendor(itrList);
    const filteredObsList = filterByVendor(obsList);
    const filteredPqpList = filterByVendor(pqpList);
    const filteredChecklistRecords = filterByVendor(checklistRecords);

    // Checklist 統計
    const checklistTotal = filteredChecklistRecords.length;
    const checklistPassed = filteredChecklistRecords.filter(item => item.status === 'Pass').length;
    const checklistOngoing = filteredChecklistRecords.filter(item => item.status === 'Ongoing').length;
    const checklistPassRate = checklistTotal > 0 ? Math.round((checklistPassed / checklistTotal) * 100) : 0;

    // ITP 統計
    const itpTotal = filteredItpList.filter(item => item.status.toLowerCase() !== 'void').length;
    const itpSubmitted = filteredItpList.filter(item => {
      const status = item.status.toLowerCase();
      return status !== 'void' && status !== 'no submit' && status !== 'nosubmit';
    }).length;
    const itpSubmissionRate = itpTotal > 0 ? Math.round((itpSubmitted / itpTotal) * 100) : 0;
    const itpApproved = filteredItpList.filter(item => {
      const status = item.status.toLowerCase();
      return status === 'approved' || status === 'approved with comments';
    }).length;
    const itpApprovalRate = itpTotal > 0 ? Math.round((itpApproved / itpTotal) * 100) : 0;

    // NCR 統計
    const ncrTotal = filteredNcrList.length;
    const ncrOpen = filteredNcrList.filter(item => item.status.toLowerCase() === 'open' || item.status.toLowerCase() === 'opening').length;
    const ncrClosed = filteredNcrList.filter(item => item.status.toLowerCase() === 'closed').length;
    const ncrCloseRate = ncrTotal > 0 ? Math.round((ncrClosed / ncrTotal) * 100) : 0;
    const ncrOpenRate = ncrTotal > 0 ? Math.round((ncrOpen / ncrTotal) * 100) : 0;

    // NOI 統計
    const noiTotal = filteredNoiList.length;
    const noiOpen = filteredNoiList.filter(item => {
      const status = (item.status || 'Open').toLowerCase();
      return status === 'open' || status === 'opening';
    }).length;
    const noiClosed = filteredNoiList.filter(item => {
      const status = (item.status || 'Open').toLowerCase();
      return status === 'closed';
    }).length;
    const noiCloseRate = noiTotal > 0 ? Math.round((noiClosed / noiTotal) * 100) : 0;
    const noiOpenRate = noiTotal > 0 ? Math.round((noiOpen / noiTotal) * 100) : 0;

    // ITR 統計
    const itrTotal = filteredItrList.length;
    const itrApproved = filteredItrList.filter(item => item.status.toLowerCase() === 'approved').length;
    const itrRejected = filteredItrList.filter(item => item.status.toLowerCase() === 'reject').length;
    const itrApprovalRate = itrTotal > 0 ? Math.round((itrApproved / itrTotal) * 100) : 0;

    // OBS 統計
    const obsTotal = filteredObsList.length;
    const obsOpen = filteredObsList.filter(item => {
      const status = (item.status || '').toLowerCase();
      return status !== 'closed';
    }).length;
    const obsClosed = filteredObsList.filter(item => {
      const status = (item.status || '').toLowerCase();
      return status === 'closed';
    }).length;
    const obsCloseRate = obsTotal > 0 ? Math.round((obsClosed / obsTotal) * 100) : 0;
    const obsOpenRate = obsTotal > 0 ? Math.round((obsOpen / obsTotal) * 100) : 0;

    // PQP 統計
    const pqpTotal = filteredPqpList.length;
    const pqpApproved = filteredPqpList.filter(item => {
      const status = (item.status || '').toLowerCase();
      return status === 'approved';
    }).length;
    const pqpReject = filteredPqpList.filter(item => {
      const status = (item.status || '').toLowerCase();
      return status === 'reject';
    }).length;
    const pqpMaturity = pqpTotal > 0 ? Math.round((pqpApproved / pqpTotal) * 100) : 0;

    return {
      itp: { total: itpTotal, submitted: itpSubmitted, submissionRate: itpSubmissionRate, approved: itpApproved, approvalRate: itpApprovalRate },
      ncr: { total: ncrTotal, open: ncrOpen, closed: ncrClosed, closeRate: ncrCloseRate, openRate: ncrOpenRate },
      obs: { total: obsTotal, open: obsOpen, closed: obsClosed, closeRate: obsCloseRate, openRate: obsOpenRate },
      noi: { total: noiTotal, open: noiOpen, closed: noiClosed, closeRate: noiCloseRate, openRate: noiOpenRate },
      itr: { total: itrTotal, approved: itrApproved, rejected: itrRejected, approvalRate: itrApprovalRate },
      pqp: { total: pqpTotal, approved: pqpApproved, reject: pqpReject, maturity: pqpMaturity },
      checklist: { total: checklistTotal, passed: checklistPassed, ongoing: checklistOngoing, passRate: checklistPassRate },
    };
  }, [itpList, ncrList, noiList, itrList, pqpList, obsList, checklistRecords, selectedVendor]);

  return { statistics, t };
};
