import { useState } from "react";
import { TopNav } from "./components/layout/TopNav";
import { Sidebar } from "./components/layout/Sidebar";
import { LibraryView } from "./features/library/LibraryView";
import { DuplicatesView } from "./features/duplicates/DuplicatesView";
import { PhotoDetailModal } from "./components/PhotoDetailModal";
import { MetadataModal } from "./features/metadata/MetadataModal";
import { useUi } from "./store/ui";

export default function App() {
  const view = useUi((s) => s.view);
  const setDetailPhotoId = useUi((s) => s.setDetailPhotoId);
  const [metaPhotoId, setMetaPhotoId] = useState<number | null>(null);

  return (
    <div className="flex h-full flex-col">
      <TopNav />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 bg-slate-100 dark:bg-slate-950">
          {view === "library" ? <LibraryView /> : <DuplicatesView />}
        </main>
      </div>

      <PhotoDetailModal
        onEditMetadata={(id) => {
          setDetailPhotoId(null);
          setMetaPhotoId(id);
        }}
      />
      <MetadataModal
        open={metaPhotoId != null}
        onClose={() => setMetaPhotoId(null)}
        photoIds={metaPhotoId != null ? [metaPhotoId] : []}
      />
    </div>
  );
}
