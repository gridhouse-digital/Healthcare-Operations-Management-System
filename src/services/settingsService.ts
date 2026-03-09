/**
 * Settings service — Legacy `settings` table has been dropped (Epic 5).
 * Job roles are now hardcoded defaults until migrated to tenant_settings.
 */

const DEFAULT_JOB_ROLES = [
    "Licensed Practical Nurse (LPN)",
    "Direct Care Worker",
    "Registered Nurse (RN)",
    "Home Health Aide (HHA)",
    "Certified Nursing Assistant (CNA)",
];

export const settingsService = {
    /** Stub — returns empty. Logo/settings will move to tenant_settings. */
    async getSettings(): Promise<Record<string, string>> {
        return {};
    },

    async getJobRoles(): Promise<string[]> {
        return DEFAULT_JOB_ROLES;
    },

    /** No-ops for write methods — settings table is dropped. */
    async updateSetting(_key: string, _value: string): Promise<void> {},
    async updateSettings(_settings: Record<string, string>): Promise<void> {},
    async updateJobRoles(_roles: string[]): Promise<void> {},
};
