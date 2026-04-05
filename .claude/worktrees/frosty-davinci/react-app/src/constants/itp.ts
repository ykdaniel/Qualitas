import { InspectionItem, ITPPhase } from "../types/itp";

export const PHASES: ITPPhase[] = [
    { code: "A", title: "A. Before Construction (施工前)", color: "bg-slate-200" },
    { code: "B", title: "B. During Construction (施工中)", color: "bg-blue-100" },
    { code: "C", title: "C. After Construction (施工後)", color: "bg-emerald-100" }
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
