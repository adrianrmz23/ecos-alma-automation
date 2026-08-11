import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getSupabaseAdminRuntimeStatus } from "@/lib/supabase/admin";
import { runSchedulerEngine } from "@/lib/scheduling/scheduler-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleTick(request: NextRequest) {
  const secret = (process.env.SCHEDULER_SECRET ?? "").trim();
  const authHeader = request.headers.get("authorization") ?? "";

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const adminRuntime = getSupabaseAdminRuntimeStatus();
  if (!adminRuntime.configured) {
    return NextResponse.json(
      { ok: false, error: "Falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 },
    );
  }

  try {
    const supabase = createAdminClient();
    const result = await runSchedulerEngine({
      supabase,
      triggerSource: "cron",
    });

    return NextResponse.json({
      ...result,
      at: new Date().toISOString(),
    }, { status: result.ok ? 200 : 207 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Error inesperado del scheduler.",
        at: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleTick(request);
}

export async function POST(request: NextRequest) {
  return handleTick(request);
}
