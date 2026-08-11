import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  badge?: string;
  title: string;
  description: string;
};

export function EmptyState({ icon: Icon, badge, title, description }: EmptyStateProps) {
  return (
    <section className="surface-card flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#f4eee5] text-[#9b713e]">
        <Icon size={21} strokeWidth={1.8} />
      </div>
      {badge ? <span className="mt-5 rounded-full border border-[#e8e3db] bg-[#faf9f6] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#969d97]">{badge}</span> : null}
      <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-[#19221d]">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#747d77]">{description}</p>
    </section>
  );
}
