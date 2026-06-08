import Link from "next/link";

import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";
import { SiteHeader } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";

export default async function HomePage() {
  const session = await auth();

  return (
    <>
      <SiteHeader
        end={
          session?.user ? (
            <div className="flex items-center gap-2">
              <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
                Dashboard
              </Link>
              <UserMenu
                name={session.user.name}
                email={session.user.email}
                image={session.user.image}
              />
            </div>
          ) : (
            <Link href="/signin" className={buttonVariants({ size: "sm" })}>
              Sign in
            </Link>
          )
        }
      />

      <main className="relative flex flex-1 flex-col">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[min(50vh,420px)] bg-gradient-to-b from-primary/[0.07] via-transparent to-transparent"
          aria-hidden
        />
        <div className="flex flex-1 items-center justify-center py-20 sm:py-24">
          <PageContainer size="narrow" className="relative text-center">
            <span className="mb-5 inline-flex rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold tracking-widest text-primary uppercase">
              Private beta · Milestone 1
            </span>
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
              An inbox that filters noise, not people.
            </h1>
            <p className="text-muted-foreground mt-6 text-balance text-lg leading-relaxed">
              Vigil connects your Gmail and Outlook accounts and uses LLMs + RAG
              to surface the messages that actually matter. Everything else gets
              quietly out of the way.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={session?.user ? "/dashboard" : "/signin"}
                className={buttonVariants({ size: "lg" })}
              >
                {session?.user ? "Open dashboard" : "Connect an inbox"}
              </Link>
              {session?.user ? (
                <Link
                  href="/dashboard/inbox"
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  Open inbox
                </Link>
              ) : null}
            </div>
          </PageContainer>
        </div>
      </main>

      <footer className="border-t border-border/80 bg-card/50 py-4 text-center text-xs text-muted-foreground">
        <PageContainer className="text-center" size="wide">
          Vigil · Your intelligent gatekeeper for email.
        </PageContainer>
      </footer>
    </>
  );
}
