import { InboxFeed } from "@/components/inbox-feed";
import { PageContainer } from "@/components/page-container";
import { SiteHeader } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";
import { prismaEmailToInboxView } from "@/lib/email/map-prisma";
import { requireUser } from "@/lib/auth";
import { DASHBOARD_NAV } from "@/lib/dashboard-nav";
import { prisma } from "@/lib/prisma";

export default async function InboxPage() {
  const user = await requireUser();
  const [emails, accountCount] = await Promise.all([
    prisma.email.findMany({
      where: { userId: user.id },
      orderBy: { receivedAt: "desc" },
      take: 200,
    }),
    prisma.account.count({ where: { userId: user.id } }),
  ]);
  const initialEmails = emails.map(prismaEmailToInboxView);

  return (
    <>
      <SiteHeader
        nav={[...DASHBOARD_NAV]}
        end={<UserMenu name={user.name} email={user.email} image={user.image} />}
      />
      <main className="flex flex-1 flex-col">
        <PageContainer className="flex flex-col gap-6 py-10 sm:py-12">
          <div className="space-y-2 border-b border-border/60 pb-6">
            <p className="text-xs font-semibold tracking-widest text-primary uppercase">
              Inbox
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Global inbox</h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              One feed for all connected mailboxes. Search is applied to the messages already
              loaded here. Use <span className="font-medium text-foreground">Sync inbox</span> to
              pull the latest from providers.
            </p>
          </div>
          <InboxFeed
            initialEmails={initialEmails}
            hasLinkedAccount={accountCount > 0}
            userId={user.id}
          />
        </PageContainer>
      </main>
    </>
  );
}
