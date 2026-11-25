import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

export type DropdownMenuItem = {
  label: string;
  onSelect: () => void | Promise<void>;
  danger?: boolean;
  disabled?: boolean;
};

type DropdownMenuProps = {
  label: string; // dipakai sebagai aria-label
  trigger: ReactNode; // isi tombol (ikon)
  items: DropdownMenuItem[];
  disabled?: boolean;
};

export function DropdownMenu({ label, trigger, items, disabled }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const getEnabledItems = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );

  // Tutup saat klik di luar menu atau tekan Escape
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Pindahkan fokus ke item pertama saat menu terbuka
  useEffect(() => {
    if (open) getEnabledItems()[0]?.focus();
  }, [open]);

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const enabled = getEnabledItems();
    if (enabled.length === 0) return;
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      enabled[(index + 1) % enabled.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      enabled[(index - 1 + enabled.length) % enabled.length].focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const handleSelect = (item: DropdownMenuItem) => {
    setOpen(false);
    triggerRef.current?.focus();
    void item.onSelect();
  };

  return (
    <div ref={rootRef} className="relative flex self-stretch shrink-0">
      <button
        ref={triggerRef}
        type="button"
        className="bg-olive-300 grid place-items-center px-4 rounded-md disabled:opacity-50"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          className="absolute left-0 top-full z-50 mt-2 min-w-56 overflow-hidden rounded-md bg-olive-200 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => handleSelect(item)}
              className={`w-full px-4 py-3 text-left hover:bg-olive-300 focus-visible:bg-olive-300 focus-visible:outline-none disabled:opacity-50 disabled:hover:bg-transparent ${
                item.danger ? "text-red-700" : ""
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}