import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit-memory";
import { NextResponse } from "next/server";
import { z } from "zod";

const limitPerUser = createRateLimiter(20);

const BodySchema = z
  .object({
    mode: z.enum(["single", "all_unanalyzed"]),
    emailId: z.string().min(1).optional(),
  })
  .strict();

function noStoreJson(body: Record<string, unknown>, init: { status?: number } = {}) {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
    },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return noStoreJson({ error: "Unauthorized" }, { status: 401 });

  const limited = limitPerUser(`analysis-request:${userId}`);
  if (!limited.ok) {
    return noStoreJson(
      { error: "Too many requests" },
      {
        status: 429,
      },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return noStoreJson({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return noStoreJson({ error: "Invalid request" }, { status: 400 });
  }

  const { mode, emailId } = parsed.data;

  if (mode === "single") {
    if (!emailId) return noStoreJson({ error: "emailId is required" }, { status: 400 });

    const owned = await prisma.email.findFirst({
      where: { id: emailId, userId },
      select: { id: true },
    });
    if (!owned) return noStoreJson({ error: "Email not found" }, { status: 404 });

    await prisma.emailAnalysisRequest.create({
      data: { userId, emailId, mode, status: "PENDING" },
    });
    return noStoreJson({ status: "queued" });
  }

  // all_unanalyzed
  await prisma.emailAnalysisRequest.create({
    data: { userId, emailId: null, mode, status: "PENDING" },
  });
  return noStoreJson({ status: "queued" });
}

export function GET() {
  return noStoreJson({ error: "Method not allowed. Use POST." }, { status: 405 });
}

