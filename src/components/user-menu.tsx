import Link from "next/link";

import { signOut } from "@/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function UserMenu({ name, email, image }: Props) {
  const initials = (name ?? email ?? "U")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="h-9 w-9">
          {image ? <AvatarImage src={image} alt={name ?? "User"} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span className="text-sm font-medium">{name ?? "Signed in"}</span>
            {email ? (
              <span className="text-xs text-muted-foreground">{email}</span>
            ) : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/dashboard" className="cursor-pointer" />}>
            Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/dashboard/inbox" className="cursor-pointer" />}>
            Inbox
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/dashboard/intents" className="cursor-pointer" />}>
            Intents
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/dashboard/settings" className="cursor-pointer" />}>
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <DropdownMenuItem
            nativeButton
            render={<button type="submit" className="w-full cursor-pointer" />}
          >
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
