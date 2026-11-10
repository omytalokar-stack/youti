import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex w-auto max-w-none flex-col gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-full sm:max-w-sm">
      {toasts.map(toast => {
        let icon = <Info className="w-4 h-4 text-sky-400 shrink-0" />;
        let borderColor = 'border-sky-500/30';
        if (toast.type === 'success') {
          icon = <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
          borderColor = 'border-emerald-500/30';
        } else if (toast.type === 'warning') {
          icon = <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
          borderColor = 'border-amber-500/30';
        } else if (toast.type === 'error') {
          icon = <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />;
          borderColor = 'border-rose-500/30';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl bg-white/95 dark:bg-[#1e1f20]/95 backdrop-blur-md border ${borderColor} shadow-xl text-slate-800 dark:text-slate-100 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2`}
          >
            <div className="mt-0.5">{icon}</div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold leading-tight text-slate-900 dark:text-white">
                {toast.title}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                {toast.message}
              </p>
              {toast.action && (
                <a
                  href={toast.action.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-1 text-xs font-semibold text-indigo-500 hover:text-indigo-400 underline"
                >
                  {toast.action.label}
                </a>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
