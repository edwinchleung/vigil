import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { GoogleIcon, MicrosoftIcon } from "@/components/brand-icons";

type Props = {
  callbackUrl?: string;
};

export function SignInButtons({ callbackUrl = "/dashboard" }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: callbackUrl });
        }}
      >
        <Button type="submit" variant="outline" className="w-full gap-3">
          <GoogleIcon className="h-5 w-5" />
          Continue with Google
        </Button>
      </form>
      <form
        action={async () => {
          "use server";
          await signIn("microsoft-entra-id", { redirectTo: callbackUrl });
        }}
      >
        <Button type="submit" variant="outline" className="w-full gap-3">
          <MicrosoftIcon className="h-5 w-5" />
          Continue with Microsoft
        </Button>
      </form>
    </div>
  );
}
