import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Main column width; default matches previous pages */
  size?: "default" | "narrow" | "wide";
};

const sizeClass: Record<NonNullable<Props["size"]>, string> = {
  default: "max-w-4xl",
  narrow: "max-w-2xl",
  wide: "max-w-6xl",
};

export function PageContainer({
  children,
  className,
  size = "default",
}: Props) {
  return (
    <div
      className={cn(
        "mx-auto w-full flex-1 px-4 sm:px-6",
        sizeClass[size],
        className,
      )}
    >
      {children}
    </div>
  );
}
