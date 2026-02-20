"use client";

interface PageTitleProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function PageTitle({ title, subtitle, actions }: PageTitleProps) {
  return (
    <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <div className="flex items-center justify-between px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
