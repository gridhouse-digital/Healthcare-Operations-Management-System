import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { TrainingComplianceRecord, AdjustmentFormData } from '../types';

interface TrainingAdjustmentModalProps {
  record: TrainingComplianceRecord | null;
  employeeName: string;
  onClose: () => void;
}

const FIELD_OPTIONS = [
  { value: 'status', label: 'Status' },
  { value: 'completion_pct', label: 'Completion %' },
  { value: 'completed_at', label: 'Completed Date' },
  { value: 'training_hours', label: 'Training Hours (minutes)' },
] as const;

const COMPLIANCE_WARNING_FIELDS = ['status', 'completed_at'];

export function TrainingAdjustmentModal({ record, employeeName, onClose }: TrainingAdjustmentModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AdjustmentFormData>({
    field: 'status',
    value: '',
    reason: '',
  });

  const mutation = useMutation({
    mutationFn: async (data: AdjustmentFormData) => {
      if (!record) throw new Error('No record selected');

      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) throw new Error('Not authenticated');

      const { error } = await supabase.from('training_adjustments').insert({
        tenant_id: record.tenant_id,
        person_id: record.person_id,
        course_id: record.course_id,
        field: data.field,
        value: data.value,
        reason: data.reason,
        actor_id: user.user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Adjustment saved');
      queryClient.invalidateQueries({ queryKey: ['training-compliance'] });
      queryClient.invalidateQueries({ queryKey: ['training-stats'] });
      onClose();
    },
    onError: (err: Error) => {
      toast.error(`Failed to save adjustment: ${err.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.value.trim() || !form.reason.trim()) {
      toast.error('Value and reason are required');
      return;
    }
    mutation.mutate(form);
  };

  if (!record) return null;

  const showWarning = COMPLIANCE_WARNING_FIELDS.includes(form.field);
  const inputCls = 'w-full px-3 h-8 border border-border rounded-md text-[13px] text-foreground bg-card focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow [&_option]:bg-card [&_option]:text-foreground';
  const labelCls = 'block text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground mb-1.5';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[560px] z-[70] rounded-lg overflow-hidden"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 20px 60px hsl(0 0% 0% / 0.6)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">Add Adjustment</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {employeeName} — {record.course_name ?? `Course #${record.course_id}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
            style={{ color: 'hsl(0 0% 40%)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(0 0% 100% / 0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Field select */}
          <div>
            <label className={labelCls}>Field</label>
            <select
              value={form.field}
              onChange={e => setForm({ ...form, field: e.target.value as AdjustmentFormData['field'], value: '' })}
              className={inputCls}
            >
              {FIELD_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Value input — dynamic by field */}
          <div>
            <label className={labelCls}>Value</label>
            {form.field === 'status' ? (
              <select
                value={form.value}
                onChange={e => setForm({ ...form, value: e.target.value })}
                className={inputCls}
              >
                <option value="">Select status…</option>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            ) : form.field === 'completed_at' ? (
              <input
                type="date"
                value={form.value}
                onChange={e => setForm({ ...form, value: e.target.value })}
                className={inputCls}
              />
            ) : (
              <input
                type="number"
                placeholder={form.field === 'completion_pct' ? '0-100' : 'Minutes'}
                value={form.value}
                onChange={e => setForm({ ...form, value: e.target.value })}
                className={inputCls}
              />
            )}
          </div>

          {/* Compliance warning */}
          {showWarning && (
            <div
              className="flex items-start gap-2.5 p-3 rounded-md"
              style={{ background: 'hsl(38 96% 48% / 0.06)', border: '1px solid hsl(38 96% 48% / 0.18)' }}
            >
              <AlertTriangle size={13} strokeWidth={2} className="flex-shrink-0 mt-0.5" style={{ color: 'hsl(38 90% 56%)' }} />
              <p className="text-[12px] leading-snug" style={{ color: 'hsl(38 90% 60%)' }}>
                This overrides the value synced from LearnDash. The adjustment will be logged and auditable.
              </p>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className={labelCls}>Reason (required)</label>
            <textarea
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              rows={3}
              placeholder="Why is this adjustment being made?"
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow resize-none placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 inline-flex items-center justify-center h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? 'Saving…' : 'Save Adjustment'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="flex-1 inline-flex items-center justify-center h-8 px-4 rounded-md border border-border text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
