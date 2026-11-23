import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface Crumb {
  label: string;
  to?: string;
}

export interface Command {
  id: string;
  label: string;
  group?: string;
  icon?: LucideIcon;
  shortcut?: string;
  keywords?: string[];
  run: () => void;
}

interface LayoutValue {
  crumbs: Crumb[];
  setCrumbs: (c: Crumb[]) => void;
  pageCommands: Command[];
  setPageCommands: (owner: symbol, c: Command[] | null) => void;
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
}

const LayoutContext = createContext<LayoutValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [owners, setOwners] = useState<Map<symbol, Command[]>>(new Map());
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Stable identity: pages list it in effect dependencies (see useCommands).
  const setPageCommands = useCallback(
    (owner: symbol, c: Command[] | null) =>
      setOwners((prev) => {
        if (!c && !prev.has(owner)) return prev;
        const next = new Map(prev);
        if (c) next.set(owner, c);
        else next.delete(owner);
        return next;
      }),
    [],
  );
  const pageCommands = useMemo(() => Array.from(owners.values()).flat(), [owners]);
  const value = useMemo<LayoutValue>(
    () => ({ crumbs, setCrumbs, pageCommands, setPageCommands, paletteOpen, setPaletteOpen }),
    [crumbs, pageCommands, setPageCommands, paletteOpen],
  );
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used inside LayoutProvider');
  return ctx;
}

/** Sets the top bar breadcrumbs for the current page. */
export function useBreadcrumbs(crumbs: Crumb[]) {
  const { setCrumbs } = useLayout();
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    setCrumbs(crumbs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setCrumbs]);
}

/** Adds page-specific entries to the ⌘K command palette while the page is mounted. */
export function useCommands(commands: Command[]) {
  const { setPageCommands } = useLayout();
  const owner = useRef(Symbol('commands')).current;
  const ref = useRef(commands);
  ref.current = commands;
  const key = commands.map((c) => c.id + c.label).join('|');
  useEffect(() => {
    setPageCommands(
      owner,
      ref.current.map((c) => ({ ...c, run: () => ref.current.find((x) => x.id === c.id)?.run() })),
    );
    return () => setPageCommands(owner, null);
  }, [key, owner, setPageCommands]);
}
