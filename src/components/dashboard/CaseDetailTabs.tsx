type Tab = 'summary' | 'vitals' | 'answers' | 'audit';

const TAB_ITEMS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'vitals', label: 'Vitals' },
  { key: 'answers', label: 'Answers' },
  { key: 'audit', label: 'Audit Log' },
];

interface CaseDetailTabsProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function CaseDetailTabs({ activeTab, onTabChange }: CaseDetailTabsProps) {
  return (
    <div className="flex border-b border-dash-border px-6">
      {TAB_ITEMS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onTabChange(key)}
          className={`
            min-h-11 border-b-2 px-4 py-3 text-sm font-semibold
            transition-colors
            ${
              activeTab === key
                ? 'border-sc-500 text-sc-500'
                : 'border-transparent text-text-dim hover:text-text-muted'
            }
          `}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export type { Tab };
