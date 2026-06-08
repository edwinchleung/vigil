import { redirect } from "next/navigation";

import { auth } from "@/auth";

/** Returns the current session or `null`. Safe to call in Server Components. */
export async function getSession() {
  return auth();
}

/** Returns the current user or redirects to `/signin`. */
export async function requireUser() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/signin");
  }
  return session.user;
}
