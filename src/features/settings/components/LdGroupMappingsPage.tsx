import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { useLdGroupMappings, useSaveLdMappings } from "../hooks/useLdGroupMappings";
import type { LdGroupMapping } from "../types/tenant-settings";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Row editing
// ---------------------------------------------------------------------------

interface MappingRowProps {
  mapping: LdGroupMapping;
  onEdit: (updated: LdGroupMapping) => void;
  onDelete: () => void;
}

function MappingRow({ mapping, onEdit, onDelete }: MappingRowProps) {
  const [editing, setEditing] = useState(false);
  const { register, handleSubmit, reset } = useForm<LdGroupMapping>({
    defaultValues: mapping,
  });

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
      <tr className="border-b border-[#1F2433]">
        <td className="px-4 py-3">
          <input
            {...register("job_title", { required: true })}
            className="w-full rounded-[10px] bg-[#0D0F14] border border-[#00C9B1] text-white px-3 py-1.5 text-sm focus:outline-none"
          />
        </td>
        <td className="px-4 py-3">
          <input
            {...register("group_id", { required: true })}
            className="w-full rounded-[10px] bg-[#0D0F14] border border-[#00C9B1] text-white px-3 py-1.5 text-sm font-mono focus:outline-none"
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={handleSubmit(onSave)}
              className="p-1.5 rounded-[8px] text-[#00C9B1] hover:bg-[#00C9B1]/10 transition-colors"
              title="Save"
            >
              <Check size={14} />
            </button>
            <button
              onClick={onCancel}
              className="p-1.5 rounded-[8px] text-[#6B7280] hover:bg-[#1F2433] transition-colors"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-[#1F2433] hover:bg-[#1F2433]/40 transition-colors">
      <td className="px-4 py-3 text-white text-sm">{mapping.job_title}</td>
      <td className="px-4 py-3 text-[#9CA3AF] text-sm font-mono">{mapping.group_id}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-[8px] text-[#6B7280] hover:text-[#00C9B1] hover:bg-[#00C9B1]/10 transition-colors"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-[8px] text-[#6B7280] hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Add new mapping row
// ---------------------------------------------------------------------------

interface AddRowProps {
  onAdd: (mapping: LdGroupMapping) => void;
  onCancel: () => void;
}

function AddRow({ onAdd, onCancel }: AddRowProps) {
  const { register, handleSubmit } = useForm<LdGroupMapping>();

  return (
    <tr className="border-b border-[#1F2433] bg-[#00C9B1]/5">
      <td className="px-4 py-3">
        <input
          {...register("job_title", { required: true })}
          placeholder="e.g. Registered Nurse"
          className="w-full rounded-[10px] bg-[#0D0F14] border border-[#00C9B1] text-white px-3 py-1.5 text-sm focus:outline-none"
          autoFocus
        />
      </td>
      <td className="px-4 py-3">
        <input
          {...register("group_id", { required: true })}
          placeholder="e.g. 42"
          className="w-full rounded-[10px] bg-[#0D0F14] border border-[#00C9B1] text-white px-3 py-1.5 text-sm font-mono focus:outline-none"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={handleSubmit(onAdd)}
            className="p-1.5 rounded-[8px] text-[#00C9B1] hover:bg-[#00C9B1]/10 transition-colors"
            title="Add"
          >
            <Check size={14} />
          </button>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-[8px] text-[#6B7280] hover:bg-[#1F2433] transition-colors"
            title="Cancel"
          >
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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
      <div className="flex items-center justify-center h-40">
        <span className="text-[#6B7280] font-mono text-sm">Loading mappings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-white text-xl font-semibold">LearnDash Group Mappings</h2>
        <p className="text-[#6B7280] text-sm mt-1">
          Map job titles to LearnDash group IDs. New hires are automatically enrolled
          in the matching groups when they are onboarded.
        </p>
      </div>

      <div className="rounded-[20px] bg-[#1A1D26] border border-[#1F2433] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1F2433]">
              <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-[#6B7280]">
                Job Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-[#6B7280]">
                LearnDash Group ID
              </th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && !adding && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[#6B7280] text-sm">
                  No mappings yet. Add your first job title → group ID mapping below.
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
            {adding && (
              <AddRow
                onAdd={handleAdd}
                onCancel={() => setAdding(false)}
              />
            )}
          </tbody>
        </table>

        <div className={cn("px-4 py-3 border-t border-[#1F2433]", adding && "hidden")}>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-[#00C9B1] text-sm font-medium hover:text-[#00C9B1]/80 transition-colors"
          >
            <Plus size={14} />
            Add Mapping
          </button>
        </div>
      </div>
    </div>
  );
}
