import { sanitizeBoxBuilderTagForDisplay, splitBoxBuilderTagParts } from '../lib/boxBuilderTagDisplay';

type Props = {
  tag: string | null | undefined;
  selected?: boolean;
  title?: string;
};

export function BoxBuilderTagBadges({ tag, selected = false, title }: Props) {
  const display = sanitizeBoxBuilderTagForDisplay(tag);
  const parts = splitBoxBuilderTagParts(display);
  if (parts.length === 0) return null;

  const chipClass = selected ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600';

  return (
    <div
      className="mb-2 flex min-w-0 flex-wrap justify-center gap-1 px-0.5"
      title={title || display}
    >
      {parts.map((part, i) => (
        <span
          key={`${part}-${i}`}
          className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium leading-tight ${chipClass}`}
        >
          {part}
        </span>
      ))}
    </div>
  );
}
