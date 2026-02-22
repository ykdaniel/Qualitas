export interface NOIDetailData {
    package: string;
    referenceNo: string;
    issueDate: string;
    inspectionDate: string;
    inspectionTime: string;
    itpNo: string;
    eventNumber: string;
    checkpoint: string;
    type: string;
    contractor: string;
    contacts: string;
    phone: string;
    email: string;
    status: string;
    remark: string;
    closeoutDate: string;
    attachments: string[];
    ncrNumber?: string;
    dueDate?: string;
}

export interface BulkNOIRow {
    id: string;
    package: string;
    itpNo: string;
    eventNumber: string;
    checkpoint: string;
    inspectionTime: string;
}
