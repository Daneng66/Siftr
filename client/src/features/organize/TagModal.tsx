import { useState } from "react";
import { Modal, Button } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { useInvalidateLibrary, useTags } from "../../hooks/queries";

export function TagModal({
  open,
  onClose,
  photoIds,
}: {
  open: boolean;
  onClose: () => void;
  photoIds: number[];
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { data } = useTags();
  const invalidate = useInvalidateLibrary();

  const assign = async (tagName?: string, tagId?: number) => {
    setBusy(true);
    try {
      await api.assignTag(photoIds, tagName, tagId);
      invalidate();
      onClose();
      setName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Tag ${photoIds.length} photo${photoIds.length === 1 ? "" : "s"}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !name.trim()}
            onClick={() => assign(name.trim())}
          >
            Add tag
          </Button>
        </>
      }
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && assign(name.trim())}
        placeholder="New tag name…"
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800"
      />
      {data && data.tags.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Existing tags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((t) => (
              <button
                key={t.id}
                disabled={busy}
                onClick={() => assign(undefined, t.id)}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600 hover:bg-brand-100 hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
