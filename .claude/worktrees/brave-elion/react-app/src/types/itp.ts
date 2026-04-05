export interface ITPTranslation {
    en: string;
    ch: string;
}

export interface VerificationPoints {
    sub: string;
    teco: string;
    employer: string;
    hse: string;
}

export interface InspectionItem {
    phase: string;
    id: string;
    activity: ITPTranslation;
    standard: string;
    criteria: string;
    checkTime: ITPTranslation;
    method: ITPTranslation;
    frequency: string;
    vp: VerificationPoints;
    record: string;
    isNew?: boolean;
    insertAfter?: string;
}

export interface ITPPhase {
    code: string;
    title: string;
    color: string;
}

export interface ITPData {
    description?: string;
    referenceNo?: string;
    detail_data?: string | {
        a?: InspectionItem[];
        b?: InspectionItem[];
        c?: InspectionItem[];
        checklist?: any[];
        self_inspection?: any;
    };
}
