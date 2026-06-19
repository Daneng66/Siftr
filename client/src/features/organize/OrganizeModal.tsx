import { useState } from "react";
import { Modal, Button } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { useFolders, useInvalidateLibrary } from "../../hooks/queries";
import { FolderIcon } from "../../components/ui/icons";

const RULES = [
  { rule: "date-year", label: "By year", hint: "2023, 2024…" },
  { rule: "date-month", label: "By year / month", hint: "2024 › 07" },
  { rule: "camera", label: "By camera model", hint: "Pixel 7…" },
  { rule: "location", label: "By GPS location", hint: "1° grid cells" },
];

export function OrganizeModal({
  open,
  onClose,
  photoIds,
}: {
  open: boolean;
  onClose: () => void;
  photoIds: number[];
}) {
  const { data } = useFolders();
  const [newFolder, setNewFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const invalidate = useInvalidateLibrary();

  const done = (msg: string) => {
    invalidate();
    setResult(msg);
    setBusy(false);
  };

  const moveTo = async (folderId: number | null) => {
    setBusy(true);
    await api.moveToFolder(photoIds, folderId);
    done(folderId === null ? "Removed from folder." : "Moved.");
  };

  const createAndMove = async () => {
    if (!newFolder.trim()) return;
    setBusy(true);
    const folder = await api.createFolder(newFolder.trim(), null);
    await api.moveToFolder(photoIds, folder.id);
    setNewFolder("");
    done(`Moved to "${folder.name}".`);
  };

  const runRule = async (rule: string) => {
    setBusy(true);
    const res = await api.autoOrganize(rule, photoIds);
    done(`Organized ${res.assigned}, skipped ${res.skipped}.`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Organize ${photoIds.length} photo${photoIds.length === 1 ? "" : "s"}`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {result && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          {result}
        </p>
      )}

      <section className="mb-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Move to folder
        </h3>
        <div className="mb-2 flex gap-2">
          <input
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createAndMove()}
            placeholder="New folder name…"
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800"
          />
          <Button variant="primary" disabled={busy || !newFolder.trim()} onClick={createAndMove}>
            Create &amp; move
          </Button>
        </div>
        <div className="max-h-40 space-y-0.5 overflow-y-auto">
          {(data?.folders ?? []).map((f) => (
            <button
              key={f.id}
              disabled={busy}
              onClick={() => moveTo(f.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <FolderIcon className="text-amber-500" />
              <span className="flex-1 truncate text-left">{f.name}</span>
              <span className="text-xs text-slate-400">{f.photo_count}</span>
            </button>
          ))}
          <button
            disabled={busy}
            onClick={() => moveTo(null)}
            className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Remove from folder (unfile)
          </button>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Auto-organize by rule
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {RULES.map((r) => (
            <button
              key={r.rule}
              disabled={busy}
              onClick={() => runRule(r.rule)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-brand-900/20"
            >
              <div className="text-sm font-medium">{r.label}</div>
              <div className="text-xs text-slate-400">{r.hint}</div>
            </button>
          ))}
        </div>
      </section>
    </Modal>
  );
}
