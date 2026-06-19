import { useEffect, useState } from "react";
import { Modal, Button } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import type { RenamePlanItem } from "../../lib/types";
import { useInvalidateLibrary } from "../../hooks/queries";

const TOKENS = [
  { token: "{date:YYYY-MM-DD}", label: "Date" },
  { token: "{seq:3}", label: "Sequence" },
  { token: "{original}", label: "Original" },
  { token: "{camera}", label: "Camera" },
  { token: "{custom}", label: "Custom text" },
];

export function RenameModal({
  open,
  onClose,
  photoIds,
}: {
  open: boolean;
  onClose: () => void;
  photoIds: number[];
}) {
  const [pattern, setPattern] = useState("{date:YYYY-MM-DD}_{seq:3}");
  const [customText, setCustomText] = useState("");
  const [plan, setPlan] = useState<RenamePlanItem[]>([]);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateLibrary();

  // Auto-preview when inputs change (debounced).
  useEffect(() => {
    if (!open || photoIds.length === 0) return;
    const t = setTimeout(async () => {
      try {
        const res = await api.renamePreview(photoIds, pattern, customText);
        setPlan(res.plan);
        setHasConflicts(res.hasConflicts);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "preview failed");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [open, pattern, customText, photoIds]);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.renameApply(photoIds, pattern, customText);
      invalidate();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "rename failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Bulk rename ${photoIds.length} photo${photoIds.length === 1 ? "" : "s"}`}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || hasConflicts || plan.length === 0}
            onClick={apply}
          >
            {busy ? "Renaming…" : "Apply rename"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Pattern</label>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TOKENS.map((t) => (
              <button
                key={t.token}
                onClick={() => setPattern((p) => p + t.token)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title={t.token}
              >
                + {t.label}
              </button>
            ))}
          </div>
        </div>

        {pattern.includes("{custom}") && (
          <div>
            <label className="mb-1 block text-sm font-medium">Custom text</label>
            <input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        {hasConflicts && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            Some names conflict — resolve them before applying.
          </p>
        )}

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2 font-medium">Current</th>
                <th className="px-3 py-2 font-medium">New name</th>
              </tr>
            </thead>
            <tbody>
              {plan.slice(0, 200).map((item) => (
                <tr
                  key={item.photoId}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="truncate px-3 py-1.5 text-slate-500">
                    {item.currentName}
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {item.conflict ? (
                      <span className="text-red-500">
                        {item.newName || "(empty)"} — {item.conflict}
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {item.newName}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
