import { IntentManager } from "@/components/intents/intent-manager";
import { PageContainer } from "@/components/page-container";
import { SiteHeader } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";
import { requireUser } from "@/lib/auth";
import { DASHBOARD_NAV } from "@/lib/dashboard-nav";
import { prisma } from "@/lib/prisma";

type IntentListItem = {
  id: string;
  userId: string;
  query: string;
  deadline: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaWithIntentDelegate = typeof prisma & {
  intent: {
    findMany: (args: unknown) => Promise<IntentListItem[]>;
  };
};

export default async function IntentsPage() {
  const user = await requireUser();

  if (!("intent" in (prisma as object))) {
    return (
      <>
        <SiteHeader
          nav={[...DASHBOARD_NAV]}
          end={<UserMenu name={user.name} email={user.email} image={user.image} />}
        />
        <main className="flex flex-1 flex-col">
          <PageContainer className="flex flex-col gap-6 py-10 sm:py-12">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              <p className="font-medium">Prisma client is out of date for this route</p>
              <p className="mt-2 text-muted-foreground">
                Run <code className="rounded bg-background/60 px-1.5 py-0.5">bunx prisma generate</code>, then
                fully stop and restart <code className="rounded bg-background/60 px-1.5 py-0.5">bun run dev</code> so
                the app loads a PrismaClient that includes the Intent model.
              </p>
            </div>
          </PageContainer>
        </main>
      </>
    );
  }

  const intents = await (prisma as unknown as PrismaWithIntentDelegate).intent.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      userId: true,
      query: true,
      deadline: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
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
            <p className="text-xs font-semibold tracking-widest text-primary uppercase">Context</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Active intents</h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              Define what matters right now. The Vigil engine will use these goals to score and
              filter incoming mail.
            </p>
          </div>
          <IntentManager intents={intents} />
        </PageContainer>
      </main>
    </>
  );
}
