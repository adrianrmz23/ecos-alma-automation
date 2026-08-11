import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen lg:flex">
      <div className="z-30 lg:fixed lg:inset-y-3 lg:left-3">
        <Sidebar />
      </div>
      <main className="min-w-0 flex-1 lg:pl-[272px]">
        <div className="mx-auto max-w-[1280px] px-5 pb-14 pt-7 sm:px-8 lg:px-10 lg:pb-16 lg:pt-10">{children}</div>
      </main>
    </div>
  );
}
