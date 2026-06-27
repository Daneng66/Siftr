import { type ReactNode, useEffect } from "react";
import { XIcon } from "./icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  tall?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  tall,
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
      className={`fixed inset-0 z-50 flex bg-black/50 ${
        wide
          ? "items-end sm:items-center sm:p-4"
          : "items-center justify-center p-4"
      }`}
      onMouseDown={onClose}
    >
      <div
        className={`flex w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 ${
          wide
            ? "h-[92dvh] rounded-t-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-xl"
            : `rounded-xl max-w-[calc(100vw-2rem)] sm:max-w-lg ${tall ? "min-h-[24rem]" : ""} max-h-[90vh]`
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-3.5 dark:border-slate-700">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Close"
          >
            <XIcon className="text-lg" />
          </button>
        </div>
        <div
          className={`px-4 py-4 sm:px-5 ${
            tall
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "scroll-area flex-1 overflow-y-auto"
          }`}
        >
          {children}
        </div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5 dark:border-slate-700">
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
