import React from 'react';
import { InspectionItem, ITPHeaderData } from '../../types/itp';
import { PHASES } from '../../constants/itp';
import styles from './ITP.module.css';

interface ITPPrintTemplateProps {
    items: InspectionItem[];
    headerData?: ITPHeaderData;
}

const VPBadge = ({ type }: { type: string }) => {
    if (!type) return <span className="text-slate-200">-</span>;
    return (
        <span className="inline-flex items-center justify-center w-6 h-6 border border-slate-300 rounded font-bold text-xs">
            {type}
        </span>
    );
};

export const ITPPrintTemplate: React.FC<ITPPrintTemplateProps> = ({ items, headerData }) => {
    return (
        <div className={styles.printablePage}>
            {/* Header */}
            {headerData && (
                <div className="mb-6 border-b-2 border-slate-800 pb-4">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-32 h-16 border border-slate-300 bg-slate-50 flex items-center justify-center text-xs text-slate-400">
                            LOGO
                        </div>
                        <div className="text-center flex-1 px-4">
                            <h1 className="text-2xl font-black uppercase tracking-wide mb-2">Inspection & Test Plan</h1>
                            <div className="text-lg font-bold border-b border-dashed border-slate-400 inline-block px-4 pb-1">
                                {headerData.description}
                            </div>
                        </div>
                        <div className="text-right text-xs font-bold leading-relaxed">
                            <div>Ref No: {headerData.referenceNo}</div>
                            <div>Rev: {headerData.rev}</div>
                            <div>Date: {headerData.submissionDate}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Table */}
            <table className="w-full text-left text-xs border-collapse">
                <thead>
                    <tr className="bg-slate-100">
                        <th rowSpan={2} className="border-y border-r border-slate-400 px-2 py-2 text-center w-12">Event</th>
                        <th rowSpan={2} className="border-y border-r border-slate-400 px-2 py-2 w-48">Activity</th>
                        <th rowSpan={2} className="border-y border-r border-slate-400 px-2 py-2 w-40">Standard / Criteria</th>
                        <th rowSpan={2} className="border-y border-r border-slate-400 px-2 py-2 text-center w-24">Check Time</th>
                        <th rowSpan={2} className="border-y border-r border-slate-400 px-2 py-2 text-center w-24">Method</th>
                        <th rowSpan={2} className="border-y border-r border-slate-400 px-2 py-2 text-center w-20">Freq</th>
                        <th rowSpan={2} className="border-y border-r border-slate-400 px-2 py-2 text-center w-24">Record</th>
                        <th colSpan={4} className="border-y border-slate-400 px-2 py-1 text-center">Verification Points</th>
                    </tr>
                    <tr className="bg-slate-100">
                        <th className="border-b border-r border-slate-400 px-1 py-1 text-center w-8">Sub</th>
                        <th className="border-b border-r border-slate-400 px-1 py-1 text-center w-8">Main</th>
                        <th className="border-b border-r border-slate-400 px-1 py-1 text-center w-8">Emp</th>
                        <th className="border-b border-slate-400 px-1 py-1 text-center w-8">HSE</th>
                    </tr>
                </thead>
                <tbody>
                    {PHASES.map((phase) => (
                        <React.Fragment key={phase.code}>
                            <tr className="break-inside-avoid">
                                <td colSpan={11} className="border-b border-slate-400 bg-slate-50 px-3 py-2 font-bold uppercase tracking-wider text-xs">
                                    {phase.title}
                                </td>
                            </tr>
                            {items.filter(item => item.phase === phase.code).map((item) => (
                                <tr key={item.id} className="break-inside-avoid">
                                    <td className="border-b border-r border-slate-300 px-2 py-2 text-center font-mono align-top">{item.id}</td>
                                    <td className="border-b border-r border-slate-300 px-2 py-2 align-top">
                                        <div className="font-bold mb-0.5">{item.activity.en}</div>
                                        <div className="text-[10px] text-slate-500">{item.activity.ch}</div>
                                    </td>
                                    <td className="border-b border-r border-slate-300 px-2 py-2 align-top">
                                        <div className="text-[10px] text-slate-500 mb-1 bg-slate-50 inline-block px-1 border border-slate-200 rounded">{item.standard}</div>
                                        <div className="font-medium">{item.criteria}</div>
                                    </td>
                                    <td className="border-b border-r border-slate-300 px-2 py-2 align-top text-center">
                                        <div>{item.checkTime.en}</div>
                                        <div className="text-[10px] text-slate-500">{item.checkTime.ch}</div>
                                    </td>
                                    <td className="border-b border-r border-slate-300 px-2 py-2 align-top text-center">
                                        <div>{item.method.en}</div>
                                        <div className="text-[10px] text-slate-500">{item.method.ch}</div>
                                    </td>
                                    <td className="border-b border-r border-slate-300 px-2 py-2 align-top text-center">{item.frequency}</td>
                                    <td className="border-b border-r border-slate-300 px-2 py-2 align-top text-center font-mono text-[10px]">{item.record !== '-' ? item.record : ''}</td>
                                    <td className="border-b border-r border-slate-300 px-1 py-2 align-middle text-center"><VPBadge type={item.vp.sub} /></td>
                                    <td className="border-b border-r border-slate-300 px-1 py-2 align-middle text-center"><VPBadge type={item.vp.teco} /></td>
                                    <td className="border-b border-r border-slate-300 px-1 py-2 align-middle text-center"><VPBadge type={item.vp.employer} /></td>
                                    <td className="border-b border-slate-300 px-1 py-2 align-middle text-center"><VPBadge type={item.vp.hse} /></td>
                                </tr>
                            ))}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>

            {/* Footer Signatures */}
            <div className="mt-8 grid grid-cols-3 gap-8 break-inside-avoid">
                <div className="border-t border-slate-400 pt-2">
                    <div className="text-xs font-bold uppercase mb-8">Sub-Contractor</div>
                    <div className="h-px bg-slate-300 w-full mb-2"></div>
                    <div className="text-[10px] text-slate-500">Name / Date / Signature</div>
                </div>
                <div className="border-t border-slate-400 pt-2">
                    <div className="text-xs font-bold uppercase mb-8">Main Contractor</div>
                    <div className="h-px bg-slate-300 w-full mb-2"></div>
                    <div className="text-[10px] text-slate-500">Name / Date / Signature</div>
                </div>
                <div className="border-t border-slate-400 pt-2">
                    <div className="text-xs font-bold uppercase mb-8">Employer / Rep</div>
                    <div className="h-px bg-slate-300 w-full mb-2"></div>
                    <div className="text-[10px] text-slate-500">Name / Date / Signature</div>
                </div>
            </div>
        </div>
    );
};
