export type ApplicantStatus = 'New' | 'Screening' | 'Interview' | 'Offer' | 'Hired' | 'Rejected';

export interface Applicant {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    position_applied?: string;
    status: ApplicantStatus;
    resume_url?: string;
    tenant_id?: string;
    source?: string;
    created_at: string;
    updated_at?: string;
}

export type OfferStatus = 'Draft' | 'Pending_Approval' | 'Sent' | 'Accepted' | 'Declined';

export interface Offer {
    id: string;
    applicant_id: string;
    status: OfferStatus;
    position_title: string;
    start_date: string;
    salary: number;
    offer_letter_url?: string;
    secure_token: string;
    created_by?: string;
    created_at: string;
    updated_at: string;
    expires_at?: string;
    applicant?: Applicant; // For joined queries
}

/** Employee is now a person record with type='employee' in the `people` table. */
export interface Employee {
    id: string;
    tenant_id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string | null;
    job_title?: string | null;
    department?: string | null;
    employee_id?: string | null;
    employee_status?: string | null;
    type: string;
    profile_source?: string | null;
    wp_user_id?: number | null;
    hired_at?: string | null;
    primary_compliance_group_id?: string | null;
    applicant_id?: string | null;
    created_at: string;
    updated_at: string;
}
