"use client";

interface PageTitleProps {
  title: string;
  actions?: React.ReactNode;
}

export default function PageTitle({ title, actions }: PageTitleProps) {
  return (
    <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <div className="flex items-center justify-between px-6 py-3">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
