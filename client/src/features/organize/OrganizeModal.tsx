import { useEffect, useState } from "react";
import { Modal, Button } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import type { OrganizeDateFallback, OrganizePlanItem, OrganizeScope } from "../../lib/types";
import { useInvalidateLibrary } from "../../hooks/queries";

const TOKENS = [
  { token: "{date:YYYY}", label: "Year" },
  { token: "{date:MM}", label: "Month (01)" },
  { token: "{date:MMMM}", label: "Month name" },
  { token: "{date:DD}", label: "Day" },
  { token: "/", label: "/ (new folder)" },
  { token: "{original}", label: "Original name" },
  { token: "{camera}", label: "Camera" },
  { token: "{seq:3}", label: "Sequence" },
  { token: "{custom}", label: "Custom text" },
];

export function OrganizeModal({
  open,
  onClose,
  scope,
  scopeLabel,
}: {
  open: boolean;
  onClose: () => void;
  scope: OrganizeScope;
  scopeLabel: string;
}) {
  const [pattern, setPattern] = useState("{date:YYYY}/{date:MM}/{original}");
  const [customText, setCustomText] = useState("");
  const [retainStructure, setRetainStructure] = useState(true);
  const [dateFallback, setDateFallback] = useState<OrganizeDateFallback>("unknown");
  const [plan, setPlan] = useState<OrganizePlanItem[]>([]);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [moving, setMoving] = useState(0);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateLibrary();

  // Auto-preview when inputs change (debounced).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      try {
        const res = await api.organizePreview(scope, pattern, customText, {
          retainStructure,
          dateFallback,
        });
        setPlan(res.plan);
        setTotalPhotos(res.totalPhotos);
        setMoving(res.moving);
        setHasConflicts(res.hasConflicts);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "preview failed");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [open, scope, pattern, customText, retainStructure, dateFallback]);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.organizeApply(scope, pattern, customText, { retainStructure, dateFallback });
      invalidate();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "organize failed");
    } finally {
      setBusy(false);
    }
  };

  const conflictCount = plan.filter((p) => p.conflict).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Organize — ${scopeLabel}`}
      wide
      tall
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || hasConflicts || moving === 0}
            onClick={apply}
          >
            {busy ? "Organizing…" : `Move ${moving} photo${moving === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Folder / filename pattern</label>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {scope.kind === "folder"
              ? `Resolved relative to "${scopeLabel}". The original file extension is kept automatically.`
              : "Resolved relative to the library root. The original file extension is kept automatically."}
          </p>
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

        {pattern.includes("{date") && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              If a photo has no EXIF date
            </label>
            <select
              value={dateFallback}
              onChange={(e) => setDateFallback(e.target.value as OrganizeDateFallback)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="unknown">Group together under "unknown-date"</option>
              <option value="fileModified">Use the file's modified date instead</option>
            </select>
          </div>
        )}

        {scope.kind === "all" && (
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
            <p className="mb-2 text-sm font-medium">Existing folders</p>
            <label className="flex items-start gap-2 py-1 text-sm">
              <input
                type="radio"
                checked={retainStructure}
                onChange={() => setRetainStructure(true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Retain current structure</span> — apply the
                pattern inside each existing folder, without moving photos between folders.
              </span>
            </label>
            <label className="flex items-start gap-2 py-1 text-sm">
              <input
                type="radio"
                checked={!retainStructure}
                onChange={() => setRetainStructure(false)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Rebuild from the library root</span> — every photo
                is placed by the pattern alone, which can merge photos from different folders
                together.
              </span>
            </label>
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        {hasConflicts && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            {conflictCount} conflict{conflictCount === 1 ? "" : "s"} — resolve them before
            applying.
          </p>
        )}
        {!hasConflicts && totalPhotos > 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {totalPhotos} photo{totalPhotos === 1 ? "" : "s"} in scope · {moving} will move ·{" "}
            {totalPhotos - moving} already in place
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2 font-medium">Current path</th>
                <th className="px-3 py-2 font-medium">New path</th>
              </tr>
            </thead>
            <tbody>
              {plan.slice(0, 200).map((item) => (
                <tr
                  key={item.photoId}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="truncate px-3 py-1.5 text-slate-500">
                    {item.currentRelPath}
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {item.conflict ? (
                      <span className="text-red-500">
                        {item.newRelPath || "(empty)"} — {item.conflict}
                      </span>
                    ) : item.unchanged ? (
                      <span className="text-slate-400 dark:text-slate-500">
                        {item.newRelPath} (unchanged)
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {item.newRelPath}
                        {item.disambiguated && (
                          <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            renamed to avoid a clash
                          </span>
                        )}
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
