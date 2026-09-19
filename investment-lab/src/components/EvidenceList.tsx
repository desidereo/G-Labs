import type { EvidenceItem } from "@/lib/ui-types";
import { formatDate } from "@/components/format";

export function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (!items.length) {
    return (
      <p className="m-0 text-sm text-[var(--text-muted)]">No evidence items attached.</p>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((item, i) => (
        <li
          key={`${item.claim}-${i}`}
          className="border-b border-[var(--border)] pb-3 last:border-0 last:pb-0"
        >
          <p className="m-0 text-sm leading-relaxed text-[var(--text)]">{item.claim}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            {item.source ? <span>{item.source}</span> : null}
            {item.asOf ? <span>{formatDate(item.asOf)}</span> : null}
            {item.confidence ? (
              <span className="capitalize">Confidence: {item.confidence}</span>
            ) : null}
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[var(--primary)] hover:underline"
              >
                Source
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
