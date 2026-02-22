import { InspectionItem, ITPPhase } from "../types/itp";

export const PHASES: ITPPhase[] = [
    { code: "A", title: "A. Before Construction (施工前)", color: "bg-slate-200" },
    { code: "B", title: "B. During Construction (施工中)", color: "bg-blue-100" },
    { code: "C", title: "C. After Construction (施工後)", color: "bg-emerald-100" }
];

export const INITIAL_ITEMS: InspectionItem[] = [
    // --- Phase A ---
    {
        phase: "A", id: "A1", activity: { en: "Length", ch: "長度" }, standard: "CNS 2602", criteria: "22m ±0.3% / 25m ±0.3%",
        checkTime: { en: "Deliver to site", ch: "運抵工地" }, method: { en: "Tape measure", ch: "捲尺" }, frequency: "-",
        vp: { sub: "", teco: "", employer: "", hse: "" }, record: "-"
    },
    {
        phase: "A", id: "A2", activity: { en: "Thickness", ch: "厚度" }, standard: "CNS 2602", criteria: "100mm -2/+40mm",
        checkTime: { en: "Deliver to site", ch: "運抵工地" }, method: { en: "Tape measure", ch: "捲尺" }, frequency: "-",
        vp: { sub: "", teco: "", employer: "", hse: "" }, record: "-"
    },
    {
        phase: "A", id: "A3", activity: { en: "Outer Diameter", ch: "外徑" }, standard: "CNS 2602", criteria: "600mm -4/+7mm",
        checkTime: { en: "Deliver to site", ch: "運抵工地" }, method: { en: "Tape measure", ch: "捲尺" }, frequency: "-",
        vp: { sub: "", teco: "", employer: "", hse: "" }, record: "-"
    },
    {
        phase: "A", id: "A4", activity: { en: "Quantity", ch: "數量" }, standard: "Shipping Order", criteria: "Meet shipping order",
        checkTime: { en: "Deliver to site", ch: "運抵工地" }, method: { en: "Visual", ch: "目視檢查" }, frequency: "Each Time",
        vp: { sub: "H", teco: "W", employer: "R", hse: "" }, record: "ITP-PL-01"
    },
    {
        phase: "A", id: "A5", activity: { en: "Stakeout", ch: "放樣" }, standard: "HL-ONS-TECO-STR-DWG-02000", criteria: "Meet design req.",
        checkTime: { en: "Before construction", ch: "施工前" }, method: { en: "Tape Measure", ch: "捲尺" }, frequency: "Each Time",
        vp: { sub: "H", teco: "H", employer: "H", hse: "" }, record: "ITP-SV-01"
    },
    // --- Phase B ---
    {
        phase: "B", id: "B1", activity: { en: "Foundation piling position", ch: "基礎打設座標" }, standard: "HL-ONS-TECO-STR-DWG-02000", criteria: "Tolerance ± 7.5 cm",
        checkTime: { en: "During Piling", ch: "打樁時" }, method: { en: "Total Station", ch: "全站儀" }, frequency: "Each Pile",
        vp: { sub: "H", teco: "H", employer: "H", hse: "" }, record: "QTS-RKS-HL-CHK-000001"
    },
    {
        phase: "B", id: "B2", activity: { en: "Pile Elevation", ch: "基礎高程" }, standard: "HL-ONS-TECO-GEO-DWG-08000", criteria: "Tolerance ± 7.5 cm",
        checkTime: { en: "After Piling", ch: "打樁後" }, method: { en: "Total Station", ch: "全站儀" }, frequency: "Each Pile",
        vp: { sub: "H", teco: "W", employer: "R", hse: "" }, record: "ITP-PL-04"
    },
    {
        phase: "B", id: "B3", activity: { en: "Pile Joint", ch: "樁頭檢查" }, standard: "CNS 2602", criteria: "No Oil, Rust, Dust",
        checkTime: { en: "Before Welding", ch: "焊接前" }, method: { en: "Visual", ch: "目視" }, frequency: "Each Pile",
        vp: { sub: "H", teco: "W", employer: "W", hse: "※" }, record: "ITP-PL-02"
    },
    {
        phase: "B", id: "B4", activity: { en: "Welding", ch: "焊接" }, standard: "CNS 13341", criteria: "No Defect (無缺失)",
        checkTime: { en: "After Welding", ch: "焊接後" }, method: { en: "NDT - MT", ch: "MT 檢測" }, frequency: "1/50 pcs",
        vp: { sub: "H", teco: "W", employer: "W", hse: "※" }, record: "ITP-PL-02"
    },
    {
        phase: "B", id: "B5", activity: { en: "Verticality of Pile", ch: "基礎垂直度" }, standard: "HL-ONS-TECO-GEO-DWG-08000", criteria: "< 1/75",
        checkTime: { en: "During Piling", ch: "打樁時" }, method: { en: "Spirit Level Ruler", ch: "水平尺" }, frequency: "Each Pile",
        vp: { sub: "H", teco: "W", employer: "W", hse: "" }, record: "ITP-PL-02&04"
    },
    {
        phase: "B", id: "B6", activity: { en: "Hit number of hammers", ch: "打擊次數" }, standard: "HL-ONS-TECO-ENG-PLN-00005", criteria: "< 2000 hits",
        checkTime: { en: "During Piling", ch: "打樁時" }, method: { en: "Visual", ch: "目視" }, frequency: "Each Pile",
        vp: { sub: "H", teco: "W", employer: "W", hse: "" }, record: "ITP-PL-02&04"
    },
    // --- Phase C ---
    {
        phase: "C", id: "C1", activity: { en: "Pile Position", ch: "樁位複測" }, standard: "HL-ONS-TECO-STR-", criteria: "Tolerance < 7.5cm",
        checkTime: { en: "After Piling", ch: "打樁後" }, method: { en: "Total Station", ch: "全站儀" }, frequency: "Each Pile",
        vp: { sub: "H", teco: "W", employer: "W", hse: "" }, record: "ITP-PL-03"
    }
];

export const EMPTY_ITEM: InspectionItem = {
    phase: "B",
    id: "",
    activity: { en: "", ch: "" },
    standard: "",
    criteria: "",
    checkTime: { en: "", ch: "" },
    method: { en: "", ch: "" },
    frequency: "",
    vp: { sub: "", teco: "", employer: "", hse: "" },
    record: "-"
};
