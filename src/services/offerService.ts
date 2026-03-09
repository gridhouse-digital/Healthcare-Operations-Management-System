import { supabase } from '@/lib/supabase';
import type { Offer } from '@/types';

async function getTenantId() {
    const { data: { session } } = await supabase.auth.getSession();
    const tenantId = session?.user?.app_metadata?.tenant_id as string | undefined;
    if (!tenantId) throw new Error('Missing tenant context');
    return tenantId;
}

export const offerService = {
    async getOffers() {
        const tenantId = await getTenantId();
        const { data, error } = await supabase
            .from('offers')
            .select('*, applicant:applicants(first_name, last_name, email, status)')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Offer[];
    },

    async getOfferById(id: string) {
        const tenantId = await getTenantId();
        const { data, error } = await supabase
            .from('offers')
            .select('*, applicant:applicants(*)')
            .eq('tenant_id', tenantId)
            .eq('id', id)
            .single();

        if (error) throw error;
        return data as Offer;
    },

    async createOffer(offer: Partial<Offer>) {
        const tenantId = await getTenantId();
        const { data, error } = await supabase
            .from('offers')
            .insert({ ...offer, tenant_id: tenantId })
            .select()
            .eq('tenant_id', tenantId)
            .single();

        if (error) throw error;
        return data as Offer;
    },

    async updateOffer(id: string, updates: Partial<Offer>) {
        const tenantId = await getTenantId();
        const { data, error } = await supabase
            .from('offers')
            .update(updates)
            .eq('tenant_id', tenantId)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as Offer;
    },

    async updateStatus(id: string, status: string) {
        const tenantId = await getTenantId();
        const { error } = await supabase
            .from('offers')
            .update({ status })
            .eq('tenant_id', tenantId)
            .eq('id', id);

        if (error) throw error;
    },

    async deleteOffer(id: string) {
        const tenantId = await getTenantId();
        const { error } = await supabase
            .from('offers')
            .update({ status: 'Archived' })
            .eq('tenant_id', tenantId)
            .eq('id', id);

        if (error) throw error;
    },

    async getOfferByToken(token: string) {
        const tenantId = await getTenantId();
        const { data, error } = await supabase
            .from('offers')
            .select('*, applicant:applicants(*)')
            .eq('tenant_id', tenantId)
            .eq('secure_token', token)
            .single();

        if (error) throw error;
        return data as Offer;
    },

    async respondToOffer(token: string, status: 'Accepted' | 'Declined') {
        const { data, error } = await supabase.rpc('respond_to_offer', {
            token_arg: token,
            status_arg: status
        });

        if (error) throw error;
        if (data && !data.success) throw new Error(data.error);
    }
};
