import type { Prisma } from "@prisma/client";

function asString(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 ? x : null;
}

function getActionTitle(x: unknown): string | null {
  if (typeof x === "string") return asString(x);
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  return (
    asString(o["title"]) ??
    asString(o["text"]) ??
    asString(o["label"]) ??
    asString(o["action"]) ??
    null
  );
}

function getOptionalFields(x: unknown): {
  due?: string | null;
  assignee?: string | null;
  confidence?: number | null;
} {
  if (!x || typeof x !== "object") return {};
  const o = x as Record<string, unknown>;
  const due = asString(o["due"]) ?? null;
  const assignee = asString(o["assignee"]) ?? null;
  const confidence = typeof o["confidence"] === "number" ? o["confidence"] : null;
  return { due, assignee, confidence };
}

export function InboxActionsList({ actions }: { actions: Prisma.JsonValue | null }) {
  if (actions == null) {
    return <p className="text-muted-foreground text-sm">No actions.</p>;
  }

  if (!Array.isArray(actions)) {
    return (
      <p className="text-muted-foreground text-sm">
        Actions were saved in an unexpected format.
      </p>
    );
  }

  if (actions.length === 0) {
    return <p className="text-muted-foreground text-sm">No actions.</p>;
  }

  return (
    <ul className="space-y-2">
      {actions.map((item, idx) => {
        const title = getActionTitle(item) ?? `Action ${idx + 1}`;
        const meta = getOptionalFields(item);
        const metaParts = [
          meta.due ? `Due: ${meta.due}` : null,
          meta.assignee ? `Assignee: ${meta.assignee}` : null,
          typeof meta.confidence === "number"
            ? `Confidence: ${Math.round(meta.confidence * 100)}%`
            : null,
        ].filter(Boolean) as string[];

        return (
          <li key={idx} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
            <p className="text-sm font-medium leading-snug">{title}</p>
            {metaParts.length > 0 && (
              <p className="text-muted-foreground mt-1 text-xs">{metaParts.join(" • ")}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

