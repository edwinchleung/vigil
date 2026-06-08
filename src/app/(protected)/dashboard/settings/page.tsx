import { PageContainer } from "@/components/page-container";
import { ClassificationSettingsForm } from "@/components/settings/classification-settings-form";
import { TelegramSettingsForm } from "@/components/settings/telegram-settings-form";
import { SiteHeader } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";
import { requireUser } from "@/lib/auth";
import { DASHBOARD_NAV } from "@/lib/dashboard-nav";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

function pickAiPreferences(
  json: Prisma.JsonValue | null | undefined,
): {
  groundingSimilarityFloor: number | null;
  groundingExampleLimit: number | null;
  intentMatchLimit: number | null;
} | null {
  if (json == null || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const floor = num(o.groundingSimilarityFloor);
  const gLimit = num(o.groundingExampleLimit);
  const iLimit = num(o.intentMatchLimit);
  if (floor === null && gLimit === null && iLimit === null) return null;
  return { groundingSimilarityFloor: floor, groundingExampleLimit: gLimit, intentMatchLimit: iLimit };
}

export default async function SettingsPage() {
  const user = await requireUser();
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      telegramChatId: true,
      classificationPolicy: true,
      aiPreferences: true,
    },
  });

  return (
    <>
      <SiteHeader
        nav={[...DASHBOARD_NAV]}
        end={<UserMenu name={user.name} email={user.email} image={user.image} />}
      />
      <main className="flex flex-1 flex-col">
        <PageContainer className="flex flex-col gap-6 py-10 sm:py-12">
          <div className="space-y-2 border-b border-border/60 pb-6">
            <p className="text-xs font-semibold tracking-widest text-primary uppercase">Account</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              Optional integrations for notifications and the Context Engine.
            </p>
          </div>
          <section className="space-y-2">
            <h2 className="text-foreground text-base font-medium">AI classification</h2>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              Tell the Context Engine how you want email triage to reflect your role and
              priorities. Advanced fields tune internal retrieval; your inbox still uses the same
              three categories.
            </p>
            <ClassificationSettingsForm
              defaultPolicy={row?.classificationPolicy ?? null}
              defaultAiPreferences={pickAiPreferences(row?.aiPreferences)}
            />
          </section>
          <section className="space-y-2">
            <h2 className="text-foreground text-base font-medium">Telegram</h2>
            <TelegramSettingsForm defaultTelegramChatId={row?.telegramChatId ?? null} />
          </section>
        </PageContainer>
      </main>
    </>
  );
}
