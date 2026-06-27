import React, { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

function SectionCard({
  title,
  description,
  children,
}: SectionCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {description && (
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export default React.memo(SectionCard);