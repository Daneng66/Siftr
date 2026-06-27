import { useState } from "react";
import { Modal, Button } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { useInvalidateLibrary } from "../../hooks/queries";

interface FieldState {
  enabled: boolean;
  value: string;
}

const empty: FieldState = { enabled: false, value: "" };

export function MetadataModal({
  open,
  onClose,
  photoIds,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  photoIds: number[];
  initial?: {
    dateTaken?: string;
    gpsLat?: string;
    gpsLon?: string;
    cameraMake?: string;
    cameraModel?: string;
  };
}) {
  const [date, setDate] = useState<FieldState>({
    ...empty,
    value: initial?.dateTaken ?? "",
  });
  const [lat, setLat] = useState<FieldState>({
    ...empty,
    value: initial?.gpsLat ?? "",
  });
  const [lon, setLon] = useState<FieldState>({
    ...empty,
    value: initial?.gpsLon ?? "",
  });
  const [make, setMake] = useState<FieldState>({
    ...empty,
    value: initial?.cameraMake ?? "",
  });
  const [model, setModel] = useState<FieldState>({
    ...empty,
    value: initial?.cameraModel ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateLibrary();

  const apply = async () => {
    const edits: Record<string, unknown> = {};
    if (date.enabled && date.value)
      edits.dateTaken = new Date(date.value).toISOString();
    if (lat.enabled) edits.gpsLat = parseFloat(lat.value);
    if (lon.enabled) edits.gpsLon = parseFloat(lon.value);
    if (make.enabled) edits.cameraMake = make.value;
    if (model.enabled) edits.cameraModel = model.value;

    if (Object.keys(edits).length === 0) {
      setError("Enable at least one field to write.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.editMetadata(photoIds, edits);
      invalidate();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "metadata write failed");
    } finally {
      setBusy(false);
    }
  };

  const Field = ({
    label,
    state,
    set,
    type = "text",
    placeholder,
  }: {
    label: string;
    state: FieldState;
    set: (s: FieldState) => void;
    type?: string;
    placeholder?: string;
  }) => (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) => set({ ...state, enabled: e.target.checked })}
          className="h-4 w-4 shrink-0 accent-brand-600"
          title="Write this field"
        />
        <label className="text-sm font-medium sm:w-28 sm:shrink-0">{label}</label>
      </div>
      <input
        type={type}
        value={state.value}
        placeholder={placeholder}
        onChange={(e) => set({ ...state, value: e.target.value, enabled: true })}
        className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:border-brand-400 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
      />
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit metadata · ${photoIds.length} photo${
        photoIds.length === 1 ? "" : "s"
      }`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={apply}>
            {busy ? "Writing…" : "Write to files"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        Checked fields are written into the image files with exiftool, then
        re-indexed. Leave a field unchecked to keep each photo's existing value.
      </p>
      <div className="space-y-3">
        <Field label="Date taken" type="datetime-local" state={date} set={setDate} />
        <Field label="GPS latitude" state={lat} set={setLat} placeholder="e.g. 37.7749" />
        <Field label="GPS longitude" state={lon} set={setLon} placeholder="e.g. -122.4194" />
        <Field label="Camera make" state={make} set={setMake} placeholder="e.g. Canon" />
        <Field label="Camera model" state={model} set={setModel} placeholder="e.g. EOS R6" />
      </div>
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </Modal>
  );
}
