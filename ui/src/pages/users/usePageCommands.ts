import { useEffect, useRef } from 'react';
import { useLayout, type Command } from '@/app/layout-context';

/**
 * Same contract as `useCommands` from layout-context, but the effect only depends on
 * the command ids/labels. `setPageCommands` gets a new identity each time the layout
 * state changes, so depending on it re-registers the commands forever
 * ("Maximum update depth exceeded").
 */
export function usePageCommands(commands: Command[]) {
  const { setPageCommands } = useLayout();
  const setter = useRef(setPageCommands);
  setter.current = setPageCommands;
  const owner = useRef(Symbol('commands')).current;
  const ref = useRef(commands);
  ref.current = commands;
  const key = commands.map((c) => c.id + c.label).join('|');
  useEffect(() => {
    if (!ref.current.length) return;
    setter.current(
      owner,
      ref.current.map((c) => ({ ...c, run: () => ref.current.find((x) => x.id === c.id)?.run() })),
    );
    return () => setter.current(owner, null);
  }, [key, owner]);
}
