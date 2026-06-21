import { TopNav } from "./components/layout/TopNav";
import { Sidebar } from "./components/layout/Sidebar";
import { LibraryView } from "./features/library/LibraryView";
import { DuplicatesView } from "./features/duplicates/DuplicatesView";
import { PhotoDetailModal } from "./components/PhotoDetailModal";
import { WelcomeModal } from "./components/WelcomeModal";
import { useUi } from "./store/ui";

export default function App() {
  const view = useUi((s) => s.view);

  return (
    <div className="flex h-full flex-col">
      <TopNav />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 bg-slate-100 dark:bg-slate-950">
          {view === "library" ? <LibraryView /> : <DuplicatesView />}
        </main>
      </div>

      <PhotoDetailModal />
      <WelcomeModal />
    </div>
  );
}
