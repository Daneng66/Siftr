import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Modal, Button } from "./ui/Modal";
import { api } from "../lib/api";
import { formatBytes } from "../lib/format";
import { useUi } from "../store/ui";
import { useInvalidateLibrary } from "../hooks/queries";
import { DownloadIcon } from "./ui/icons";

// Custom SVG pin — avoids Leaflet's default marker asset resolution issues in Vite
const pinIcon = L.divIcon({
  className: "",
  html: `<svg viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" width="24" height="36">
    <path d="M12 0C7.6 0 4 3.6 4 8c0 6 8 16 8 16s8-10 8-16c0-4.4-3.6-8-8-8z" fill="#3B82F6" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="8" r="3" fill="white"/>
  </svg>`,
  iconSize: [24, 36],
  iconAnchor: [12, 36],
});

function MapRecenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon]);
  }, [lat, lon, map]);
  return null;
}

interface FormState {
  filename: string;
  dateTaken: string;
  cameraMake: string;
  cameraModel: string;
}

function toDateTimeLocal(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-0.5">
      <label className="text-xs text-slate-500 dark:text-slate-400">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800"
      />
    </div>
  );
}

export function PhotoDetailModal() {
  const { detailPhotoId, setDetailPhotoId, theme } = useUi();
  const { data: photo } = useQuery({
    queryKey: ["photo", detailPhotoId],
    queryFn: () => api.getPhoto(detailPhotoId!),
    enabled: detailPhotoId != null,
  });
  const invalidate = useInvalidateLibrary();

  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return;
    setForm({
      filename: photo.current_filename,
      dateTaken: photo.exif_date_taken ? toDateTimeLocal(photo.exif_date_taken) : "",
      cameraMake: photo.exif_camera_make ?? "",
      cameraModel: photo.exif_camera_model ?? "",
    });
    setError(null);
  }, [photo?.id]);

  const open = detailPhotoId != null;
  const close = () => setDetailPhotoId(null);

  if (!form || !photo) {
    return (
      <Modal open={open} onClose={close} title="Photo" wide>
        {null}
      </Modal>
    );
  }

  const origDate = photo.exif_date_taken ? toDateTimeLocal(photo.exif_date_taken) : "";
  const isDirty =
    form.filename !== photo.current_filename ||
    form.dateTaken !== origDate ||
    form.cameraMake !== (photo.exif_camera_make ?? "") ||
    form.cameraModel !== (photo.exif_camera_model ?? "");

  const set = (key: keyof FormState) => (v: string) =>
    setForm((f) => f && { ...f, [key]: v });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (form.filename !== photo.current_filename) {
        await api.renamePhoto(photo.id, form.filename);
      }

      const edits: Record<string, unknown> = {};
      if (form.dateTaken !== origDate) {
        edits.dateTaken = form.dateTaken
          ? new Date(form.dateTaken + ":00Z").toISOString()
          : null;
      }
      if (form.cameraMake !== (photo.exif_camera_make ?? "")) {
        edits.cameraMake = form.cameraMake || null;
      }
      if (form.cameraModel !== (photo.exif_camera_model ?? "")) {
        edits.cameraModel = form.cameraModel || null;
      }
      if (Object.keys(edits).length > 0) {
        await api.editMetadata([photo.id], edits);
      }

      invalidate();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

  const lat = photo.gps_lat ?? NaN;
  const lon = photo.gps_lon ?? NaN;
  const hasCoords = !isNaN(lat) && !isNaN(lon);

  return (
    <Modal
      open={open}
      onClose={close}
      title={photo.current_filename}
      wide
      footer={
        <>
          <a href={api.rawUrl(photo.id, true)}>
            <Button variant="default">
              <DownloadIcon /> Download
            </Button>
          </a>
          <Button variant="primary" disabled={!isDirty || busy} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <div className="flex items-center justify-center rounded-lg bg-slate-900">
          <img
            src={api.rawUrl(photo.id)}
            alt={photo.current_filename}
            className="max-h-[40vh] w-full rounded-lg object-contain sm:max-h-[60vh]"
          />
        </div>
        <div className="space-y-3 overflow-y-auto">
          <Row label="Dimensions" value={photo.width ? `${photo.width} × ${photo.height}` : ""} />
          <Row label="File size" value={formatBytes(photo.file_size)} />
          <Row label="Type" value={photo.mime_type} />

          <div className="border-t border-slate-200 pt-1 dark:border-slate-700" />

          <Field label="Filename" value={form.filename} onChange={set("filename")} />
          <Field
            label="Date taken"
            type="datetime-local"
            value={form.dateTaken}
            onChange={set("dateTaken")}
          />
          <Field
            label="Camera make"
            value={form.cameraMake}
            onChange={set("cameraMake")}
            placeholder="e.g. Canon"
          />
          <Field
            label="Camera model"
            value={form.cameraModel}
            onChange={set("cameraModel")}
            placeholder="e.g. EOS R6"
          />
          <Row
            label="GPS"
            value={hasCoords ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : ""}
          />

          {hasCoords && (
            <div className="space-y-1">
              <div className="h-36 overflow-hidden rounded-lg sm:h-48">
                <MapContainer
                  center={[lat, lon]}
                  zoom={13}
                  style={{ height: "100%", width: "100%" }}
                  zoomControl={false}
                  attributionControl={false}
                >
                  <TileLayer url={theme === "dark" ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"} />
                  <MapRecenter lat={lat} lon={lon} />
                  <Marker position={[lat, lon]} icon={pinIcon} />
                </MapContainer>
              </div>
              <a
                href={`https://www.google.com/maps?q=${lat},${lon}`}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-xs text-brand-600 hover:underline"
              >
                View in Google Maps ↗
              </a>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
