import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { useLdGroupMappings, useSaveLdMappings } from "../hooks/useLdGroupMappings";
import type { LdGroupMapping } from "../types/tenant-settings";
import { cn } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/35";
const idInputCls = `${inputCls} tracking-[0.01em]`;

interface MappingRowProps {
  mapping: LdGroupMapping;
  onEdit: (updated: LdGroupMapping) => void;
  onDelete: () => void;
}

function MappingRow({ mapping, onEdit, onDelete }: MappingRowProps) {
  const [editing, setEditing] = useState(false);
  const { register, handleSubmit, reset } = useForm<LdGroupMapping>({ defaultValues: mapping });

  function onSave(values: LdGroupMapping) {
    onEdit(values);
    setEditing(false);
  }

  function onCancel() {
    reset(mapping);
    setEditing(false);
  }

  if (editing) {
    return (
      <tr className="border-b border-border">
        <td className="px-4 py-3">
          <input {...register("job_title", { required: true })} className={inputCls} />
        </td>
        <td className="px-4 py-3">
          <input {...register("group_id", { required: true })} className={idInputCls} />
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2">
            <button onClick={handleSubmit(onSave)} className="rounded-md p-1.5 text-primary transition-colors hover:bg-primary/10" title="Save">
              <Check size={14} />
            </button>
            <button onClick={onCancel} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary" title="Cancel">
              <X size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border transition-colors hover:bg-secondary/65">
      <td className="px-4 py-3 text-sm tracking-[0.005em] text-foreground">{mapping.job_title}</td>
      <td className="px-4 py-3 text-sm tracking-[0.01em] text-muted-foreground">{mapping.group_id}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary" title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

interface AddRowProps {
  onAdd: (mapping: LdGroupMapping) => void;
  onCancel: () => void;
}

function AddRow({ onAdd, onCancel }: AddRowProps) {
  const { register, handleSubmit } = useForm<LdGroupMapping>();

  return (
    <tr className="border-b border-border bg-primary/5">
      <td className="px-4 py-3">
        <input {...register("job_title", { required: true })} placeholder="e.g. Registered Nurse" className={inputCls} autoFocus />
      </td>
      <td className="px-4 py-3">
        <input {...register("group_id", { required: true })} placeholder="e.g. 42" className={idInputCls} />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button onClick={handleSubmit(onAdd)} className="rounded-md p-1.5 text-primary transition-colors hover:bg-primary/10" title="Add">
            <Check size={14} />
          </button>
          <button onClick={onCancel} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary" title="Cancel">
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function LdGroupMappingsPage() {
  const { data: mappings = [], isLoading } = useLdGroupMappings();
  const saveMappings = useSaveLdMappings();
  const [localMappings, setLocalMappings] = useState<LdGroupMapping[] | null>(null);
  const [adding, setAdding] = useState(false);

  const displayed = localMappings ?? mappings;

  async function commitSave(updated: LdGroupMapping[]) {
    await saveMappings.mutateAsync(updated);
    setLocalMappings(null);
    toast.success("Mappings saved");
  }

  function handleEdit(index: number, updated: LdGroupMapping) {
    const next = displayed.map((m, i) => (i === index ? updated : m));
    setLocalMappings(next);
    void commitSave(next);
  }

  function handleDelete(index: number) {
    const next = displayed.filter((_, i) => i !== index);
    setLocalMappings(next);
    void commitSave(next);
  }

  function handleAdd(mapping: LdGroupMapping) {
    const next = [...displayed, mapping];
    setLocalMappings(next);
    setAdding(false);
    void commitSave(next);
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <span className="text-sm tracking-[0.02em] text-muted-foreground">Loading mappings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="page-header-title text-[1.7rem]">LearnDash Group Mappings</h2>
        <p className="page-header-meta max-w-xl">
          Map job titles to LearnDash group IDs so new hires are automatically enrolled in the right learning paths during onboarding.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left"><span className="zone-label">Job Title</span></th>
              <th className="px-4 py-3 text-left"><span className="zone-label">LearnDash Group ID</span></th>
              <th className="w-24 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && !adding && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No mappings yet. Add your first job title to group mapping below.
                </td>
              </tr>
            )}
            {displayed.map((mapping, i) => (
              <MappingRow
                key={`${mapping.job_title}-${i}`}
                mapping={mapping}
                onEdit={(updated) => handleEdit(i, updated)}
                onDelete={() => handleDelete(i)}
              />
            ))}
            {adding && <AddRow onAdd={handleAdd} onCancel={() => setAdding(false)} />}
          </tbody>
        </table>

        <div className={cn("border-t border-border px-4 py-3", adding && "hidden")}>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-sm font-medium tracking-[0.01em] text-primary transition-colors hover:text-primary/80"
          >
            <Plus size={14} />
            Add Mapping
          </button>
        </div>
      </div>
    </div>
  );
}
