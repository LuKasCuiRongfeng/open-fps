// TabButton: settings panel tab button component.
// TabButton：设置面板标签按钮组件

type TabButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

export function TabButton({ active, label, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "w-full rounded-md border border-accent-primary/45 bg-accent-primary/15 px-3 py-2 text-left text-xs text-content-primary"
          : "w-full rounded-md border border-transparent bg-transparent px-3 py-2 text-left text-xs text-content-muted transition-colors hover:bg-surface-control-hover hover:text-content-primary"
      }
    >
      {label}
    </button>
  );
}
