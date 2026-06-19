import { type ReactNode, useEffect } from "react";
import { XIcon } from "./icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full ${
          wide ? "max-w-5xl" : "max-w-lg"
        } flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-700">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Close"
          >
            <XIcon className="text-lg" />
          </button>
        </div>
        <div className="scroll-area flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Button({
  variant = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger" | "ghost";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const variants: Record<string, string> = {
    default:
      "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost:
      "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
