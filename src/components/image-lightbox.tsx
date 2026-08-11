"use client";

import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";

export function ImageLightbox({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`group relative overflow-hidden ${className}`} aria-label={`Ampliar ${alt}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]" />
        <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#17201b]/80 text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
          <Maximize2 size={13} />
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#111713]/90 p-5 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <button type="button" onClick={() => setOpen(false)} className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20" aria-label="Cerrar vista previa">
            <X size={19} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[88vh] max-w-[92vw] rounded-[24px] object-contain shadow-2xl" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </>
  );
}
