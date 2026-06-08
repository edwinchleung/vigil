import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SiteHeader } from "@/components/site-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignInButtons } from "@/components/sign-in-buttons";

type SearchParams = Promise<{ callbackUrl?: string }>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;
  if (session?.user) redirect(callbackUrl ?? "/dashboard");

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6">
        <Card className="w-full max-w-md shadow-md ring-1 ring-border/70">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome to Vigil</CardTitle>
            <CardDescription>
              Connect a mailbox to get started. We ask only for read access.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <SignInButtons callbackUrl={callbackUrl ?? "/dashboard"} />
            <p className="text-center text-xs text-muted-foreground">
              By continuing you agree that Vigil may read your email metadata to
              run its filtering pipeline.{" "}
              <Link href="/" className="text-primary underline-offset-4 hover:underline">
                Back home
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
