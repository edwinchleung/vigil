/**
 * True when any user-visible message fields differ from the stored row
 * (used to reset AI fields on sync when content changes).
 */
export function contentMeaningfullyChanged(
  existing: {
    subject: string | null;
    sender: string | null;
    snippet: string | null;
    threadId?: string | null;
  },
  item: {
    subject: string | null;
    sender: string | null;
    snippet: string | null;
    threadId?: string | null;
  },
): boolean {
  return (
    (existing.subject ?? "") !== (item.subject ?? "") ||
    (existing.sender ?? "") !== (item.sender ?? "") ||
    (existing.snippet ?? "") !== (item.snippet ?? "") ||
    (existing.threadId ?? "") !== (item.threadId ?? "")
  );
}
