"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarClock, History, Home, Images, LogOut, Settings } from "lucide-react";
import { signOut } from "@/app/actions";

const items = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/bulk-schedule", label: "Programar", icon: Images },
  { href: "/queue", label: "Cola", icon: CalendarClock },
  { href: "/library", label: "Historial", icon: History },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-full flex-col border-b border-[#e6e1d8] bg-[#f7f5f0]/95 lg:h-[calc(100vh-24px)] lg:w-[248px] lg:rounded-[26px] lg:border lg:shadow-[0_18px_60px_rgba(31,37,32,0.06)] lg:backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-5 py-4 lg:block lg:px-5 lg:pb-5 lg:pt-6">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#1b241f] text-[#f6ead6] shadow-sm">
            <BookOpen size={19} strokeWidth={1.8} />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#f7f5f0] bg-[#b9874b]" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[-0.01em] text-[#19221d]">Ecos del Alma</p>
            <p className="mt-0.5 text-[11px] font-medium text-[#8a918c]">Publicador de contenido</p>
          </div>
        </div>
        <span className="hidden rounded-full border border-[#e5dfd5] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a7546] lg:inline-flex">Studio</span>
        <form action={signOut} className="lg:hidden">
          <button type="submit" aria-label="Cerrar sesión" className="flex h-10 w-10 items-center justify-center rounded-[13px] border border-[#e5e0d8] bg-white text-[#7c847e]">
            <LogOut size={17} />
          </button>
        </form>
      </div>

      <div className="hidden px-5 lg:block">
        <div className="h-px bg-[#e5e0d8]" />
        <p className="pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a1a7a2]">Navegación</p>
      </div>

      <nav className="flex gap-1.5 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex shrink-0 items-center gap-3 rounded-[15px] px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-white text-[#19221d] shadow-[0_6px_18px_rgba(31,37,32,0.055)] ring-1 ring-[#e7e2da]"
                  : "text-[#68716b] hover:bg-white/65 hover:text-[#19221d]"
              }`}
            >
              {active ? <span className="absolute left-0 h-5 w-[3px] rounded-r-full bg-[#ad7f43]" /> : null}
              <Icon size={17} strokeWidth={active ? 2 : 1.8} className={active ? "text-[#946a38]" : "text-[#8e9690] group-hover:text-[#6b746e]"} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden px-4 pb-4 lg:block">
        <div className="mb-2 rounded-[18px] border border-[#e6e0d7] bg-white/65 px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#a0a69f]">Flujo</p>
          <div className="mt-2 flex items-center gap-2 text-xs font-medium text-[#5f6962]">
            <span className="h-2 w-2 rounded-full bg-[#5d8a6d]" />
            Programación activa
          </div>
        </div>
        <form action={signOut}>
          <button type="submit" className="flex w-full items-center gap-3 rounded-[15px] px-3.5 py-2.5 text-sm font-medium text-[#7b837d] transition hover:bg-white hover:text-[#a44c4c]">
            <LogOut size={17} strokeWidth={1.8} />
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
