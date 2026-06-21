import { useState } from "react";
import { Button, Modal } from "./ui/Modal";
import {
  ImagesIcon,
  CopyIcon,
  PencilIcon,
  TrashIcon,
} from "./ui/icons";

const STORAGE_KEY = "siftr-welcome-seen";

/** Whether the first-run welcome has already been dismissed on this device. */
function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markWelcomeSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-base text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {children}
        </p>
      </div>
    </li>
  );
}

/**
 * One-time introduction shown on the very first load (tracked in localStorage),
 * outlining what Siftr does and disclaiming responsibility for data integrity.
 */
export function WelcomeModal() {
  const [open, setOpen] = useState(() => !hasSeenWelcome());

  const dismiss = () => {
    markWelcomeSeen();
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title="Welcome to Siftr"
      footer={
        <Button variant="primary" onClick={dismiss}>
          Get started
        </Button>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Siftr helps you tidy up a photo library on disk. Point it at your photos
        and it indexes them so you can:
      </p>

      <ul className="mt-4 space-y-3">
        <Feature icon={<ImagesIcon />} title="Browse your library">
          Scan a folder of photos and explore them by folder, with thumbnails
          and EXIF details.
        </Feature>
        <Feature icon={<CopyIcon />} title="Find &amp; remove duplicates">
          Detect exact (and optionally near-) duplicate images and clear out the
          redundant copies, keeping the best of each set.
        </Feature>
        <Feature icon={<PencilIcon />} title="Rename &amp; edit metadata">
          Bulk-rename files with patterns and edit EXIF metadata in place.
        </Feature>
        <Feature icon={<TrashIcon />} title="Safe, reversible deletion">
          Removed files move to a trash area you can restore from at any time —
          until you choose to empty it.
        </Feature>
      </ul>

      <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-semibold">Disclaimer — back up your data</p>
        <p className="mt-1 opacity-90">
          Siftr modifies and deletes files on disk. It is provided “as is”,
          without any warranty, and takes no responsibility for data loss or
          corruption. Always keep a suitable, independent backup of your photos
          before using it.
        </p>
      </div>
    </Modal>
  );
}
