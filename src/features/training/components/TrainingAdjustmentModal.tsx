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
      queryClient.invalidateQueries({ queryKey: ['employee-training-detail', record?.person_id] });
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
  const inputCls = 'w-full h-9 rounded-md border border-border bg-card px-3 text-[13px] text-foreground transition-shadow focus:outline-none focus:ring-1 focus:ring-primary/35 [&_option]:bg-card [&_option]:text-foreground';
  const labelCls = 'form-label';

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="fixed left-1/2 top-1/2 z-[70] w-full max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 20px 60px hsl(0 0% 0% / 0.6)' }}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">Add Adjustment</h3>
            <p className="mt-0.5 text-[12px] tracking-[0.01em] text-muted-foreground">
              {employeeName} - {record.course_name ?? `Course #${record.course_id}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
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

          <div>
            <label className={labelCls}>Value</label>
            {form.field === 'status' ? (
              <select
                value={form.value}
                onChange={e => setForm({ ...form, value: e.target.value })}
                className={inputCls}
              >
                <option value="">Select status...</option>
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

          {showWarning && (
            <div
              className="flex items-start gap-2.5 rounded-md p-3"
              style={{ background: 'hsl(38 96% 48% / 0.06)', border: '1px solid hsl(38 96% 48% / 0.18)' }}
            >
              <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: 'hsl(38 90% 56%)' }} />
              <p className="text-[12px] leading-snug tracking-[0.005em]" style={{ color: 'hsl(38 90% 60%)' }}>
                This overrides the value synced from LearnDash. The adjustment will be logged and auditable.
              </p>
            </div>
          )}

          <div>
            <label className={labelCls}>Reason</label>
            <textarea
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              rows={3}
              placeholder="Why is this adjustment being made?"
              className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-[13px] text-foreground transition-shadow placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/35"
            />
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary px-4 text-[13px] font-semibold tracking-[0.01em] text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving...' : 'Save Adjustment'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-border px-4 text-[13px] font-semibold tracking-[0.01em] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
