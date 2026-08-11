type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  meta?: string;
};

export function PageHeader({ eyebrow, title, description, meta }: PageHeaderProps) {
  return (
    <header className="mb-8 sm:mb-10">
      <div className="flex flex-wrap items-center gap-2">
        {eyebrow ? (
          <span className="inline-flex rounded-full border border-[#e7dac8] bg-[#f6efe5] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#956b36]">
            {eyebrow}
          </span>
        ) : null}
        {meta ? <span className="text-xs font-medium text-[#8a918c]">{meta}</span> : null}
      </div>
      <h1 className="mt-4 max-w-4xl text-[2.15rem] font-semibold leading-[1.08] tracking-[-0.035em] text-[#17201b] sm:text-[2.75rem]">
        {title}
      </h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#6d756f] sm:text-base">
        {description}
      </p>
    </header>
  );
}
