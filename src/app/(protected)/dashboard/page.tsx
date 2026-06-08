import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { DASHBOARD_NAV } from "@/lib/dashboard-nav";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserMenu } from "@/components/user-menu";
import { GoogleIcon, MicrosoftIcon } from "@/components/brand-icons";
import { SignInButtons } from "@/components/sign-in-buttons";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const PROVIDER_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  google: { label: "Google / Gmail", icon: GoogleIcon },
  "microsoft-entra-id": { label: "Microsoft / Outlook", icon: MicrosoftIcon },
};

export default async function DashboardPage() {
  const user = await requireUser();

  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    select: { provider: true, expires_at: true, scope: true },
    orderBy: { provider: "asc" },
  });

  const connected = new Set(accounts.map((a) => a.provider));

  return (
    <>
      <SiteHeader
        nav={[...DASHBOARD_NAV]}
        end={<UserMenu name={user.name} email={user.email} image={user.image} />}
      />

      <main className="flex flex-1 flex-col">
        <PageContainer className="flex flex-col gap-8 py-12 sm:py-14">
          <section className="space-y-2 border-b border-border/60 pb-8">
            <p className="text-xs font-semibold tracking-widest text-primary uppercase">
              Mail connections
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
              Manage the mailboxes Vigil is authorised to read from.
            </p>
          </section>

          {connected.size > 0 && (
            <p className="text-sm">
              <Link
                href="/dashboard/inbox"
                className={buttonVariants({ variant: "default", className: "inline-flex" })}
              >
                Open global inbox
              </Link>
              <span className="text-muted-foreground ms-2">
                Sync and read email from your connected account(s).
              </span>
            </p>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            {Object.entries(PROVIDER_META).map(([key, meta]) => {
              const account = accounts.find((a) => a.provider === key);
              const isConnected = connected.has(key);
              const Icon = meta.icon;
              return (
                <Card
                  key={key}
                  className={cn(
                    "flex flex-col transition-shadow",
                    isConnected && "ring-1 ring-primary/20 shadow-sm",
                  )}
                >
                  <CardHeader className="flex flex-row items-start gap-3">
                    <div
                      className={cn(
                        "flex size-12 shrink-0 items-center justify-center rounded-xl",
                        isConnected ? "bg-primary/10" : "bg-muted",
                      )}
                    >
                      <Icon
                        className={cn("size-7", isConnected && "text-primary")}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{meta.label}</CardTitle>
                      <CardDescription className="mt-1.5">
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-3" strokeWidth={2.5} />
                            </span>
                            <Badge variant="secondary">Connected</Badge>
                          </span>
                        ) : (
                          <Badge variant="outline" className="mt-0.5">
                            Not connected
                          </Badge>
                        )}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="mt-auto text-xs text-muted-foreground">
                    {isConnected && account?.expires_at ? (
                      <>Token expires {new Date(account.expires_at * 1000).toLocaleString()}</>
                    ) : (
                      <>Sign in with this provider to grant read access.</>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </section>

          {connected.size < Object.keys(PROVIDER_META).length ? (
            <section>
              <Card className="shadow-sm ring-1 ring-border/60">
                <CardHeader>
                  <CardTitle className="text-base">Connect another mailbox</CardTitle>
                  <CardDescription>
                    Sign in with an additional provider to link it to this account.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SignInButtons callbackUrl="/dashboard" />
                </CardContent>
              </Card>
            </section>
          ) : (
            <section className="text-sm text-muted-foreground">
              All supported mailboxes are connected.{" "}
              <Link
                href="/dashboard/inbox"
                className={buttonVariants({ variant: "link", className: "h-auto p-0" })}
              >
                Open global inbox
              </Link>{" "}
              to sync and read mail.{" "}
              <Link
                href="/"
                className={buttonVariants({ variant: "link", className: "h-auto p-0" })}
              >
                Back home
              </Link>
            </section>
          )}
        </PageContainer>
      </main>
    </>
  );
}
