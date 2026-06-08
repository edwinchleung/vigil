import { PageContainer } from "@/components/page-container";
import { SiteHeader } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";
import { InboxEmailDetail } from "@/components/inbox-email-detail";
import type { InboxEmailDetailModel } from "@/components/inbox-email-detail";
import { requireUser } from "@/lib/auth";
import { DASHBOARD_NAV } from "@/lib/dashboard-nav";
import { prisma } from "@/lib/prisma";

export default async function InboxEmailDetailPage({
  params,
}: {
  params: Promise<{ emailId: string }>;
}) {
  const user = await requireUser();
  const { emailId } = await params;

  const row = await prisma.email.findFirst({
    where: { id: emailId, userId: user.id },
    select: {
      id: true,
      userId: true,
      provider: true,
      externalId: true,
      threadId: true,
      subject: true,
      sender: true,
      snippet: true,
      receivedAt: true,
      isRead: true,
      aiStatus: true,
      vigilScore: true,
      category: true,
      summary: true,
      actions: true,
      raw: true,
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
          {row ? (
            <InboxEmailDetail
              initialEmail={
                {
                  id: row.id,
                  userId: row.userId,
                  provider: row.provider,
                  externalId: row.externalId,
                  threadId: row.threadId,
                  subject: row.subject,
                  sender: row.sender,
                  snippet: row.snippet,
                  receivedAt: row.receivedAt.toISOString(),
                  isRead: row.isRead,
                  aiStatus: row.aiStatus,
                  vigilScore: row.vigilScore,
                  category: row.category,
                  summary: row.summary,
                  actions: row.actions ?? null,
                  raw: row.raw ?? null,
                } satisfies InboxEmailDetailModel
              }
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border/80 bg-card/50 px-6 py-10 text-center sm:px-8">
              <h1 className="text-foreground text-base font-semibold">Email not found</h1>
              <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
                This message may have been deleted or you may not have access to it.
              </p>
            </div>
          )}
        </PageContainer>
      </main>
    </>
  );
}

