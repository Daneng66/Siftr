import { useQuery } from "@tanstack/react-query";
import { Modal, Button } from "./ui/Modal";
import { api } from "../lib/api";
import { formatBytes, formatDateTime } from "../lib/format";
import { useUi } from "../store/ui";
import { DownloadIcon } from "./ui/icons";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

export function PhotoDetailModal({ onEditMetadata }: { onEditMetadata: (id: number) => void }) {
  const { detailPhotoId, setDetailPhotoId } = useUi();
  const { data: photo } = useQuery({
    queryKey: ["photo", detailPhotoId],
    queryFn: () => api.getPhoto(detailPhotoId!),
    enabled: detailPhotoId != null,
  });

  const open = detailPhotoId != null;
  const close = () => setDetailPhotoId(null);

  return (
    <Modal
      open={open}
      onClose={close}
      title={photo?.current_filename ?? "Photo"}
      wide
      footer={
        photo && (
          <>
            <a href={api.rawUrl(photo.id, true)}>
              <Button variant="default">
                <DownloadIcon /> Download
              </Button>
            </a>
            <Button variant="primary" onClick={() => onEditMetadata(photo.id)}>
              Edit metadata
            </Button>
          </>
        )
      }
    >
      {photo && (
        <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <div className="flex items-center justify-center rounded-lg bg-slate-900">
            <img
              src={api.rawUrl(photo.id)}
              alt={photo.current_filename}
              className="max-h-[60vh] w-full rounded-lg object-contain"
            />
          </div>
          <div>
            <Row label="Dimensions" value={photo.width ? `${photo.width} × ${photo.height}` : ""} />
            <Row label="File size" value={formatBytes(photo.file_size)} />
            <Row label="Type" value={photo.mime_type} />
            <Row label="Date taken" value={formatDateTime(photo.exif_date_taken)} />
            <Row label="Camera" value={[photo.exif_camera_make, photo.exif_camera_model].filter(Boolean).join(" ")} />
            <Row
              label="GPS"
              value={
                photo.gps_lat != null
                  ? `${photo.gps_lat.toFixed(5)}, ${photo.gps_lon?.toFixed(5)}`
                  : ""
              }
            />
            <Row label="Imported" value={formatDateTime(photo.date_imported)} />
            <Row label="Hash" value={<span className="font-mono text-xs">{photo.file_hash?.slice(0, 16)}…</span>} />
            <div className="mt-3">
              <span className="text-sm text-slate-500 dark:text-slate-400">Tags</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {photo.tags.length === 0 ? (
                  <span className="text-sm text-slate-400">none</span>
                ) : (
                  photo.tags.map((t) => (
                    <span
                      key={t.id}
                      className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {t.name}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
