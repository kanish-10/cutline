import { useCallback, useEffect, useRef } from "react";

export interface KeyboardShortcut {
  key: string;
  description: string;
  action: () => void;
  global?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

const MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  enabled = true,
) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      for (const shortcut of shortcutsRef.current) {
        const ctrlOrMeta = MAC ? event.metaKey : event.ctrlKey;
        const ctrlMatch =
          shortcut.ctrlKey === undefined
            ? true
            : shortcut.ctrlKey === ctrlOrMeta;
        const shiftMatch =
          shortcut.shiftKey === undefined
            ? true
            : shortcut.shiftKey === event.shiftKey;
        const altMatch =
          shortcut.altKey === undefined
            ? true
            : shortcut.altKey === event.altKey;
        const metaMatch =
          shortcut.metaKey === undefined
            ? true
            : shortcut.metaKey === event.metaKey;

        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          ctrlMatch &&
          shiftMatch &&
          altMatch &&
          metaMatch
        ) {
          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, enabled]);

  return shortcuts;
}

export function useGlobalKeyboardShortcuts(
  shortcuts: Record<string, () => void>,
  enabled = true,
) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const ctrlOrMeta = MAC ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();
      const combo = [
        event.ctrlKey && !MAC && "ctrl",
        event.metaKey && MAC && "cmd",
        event.shiftKey && "shift",
        event.altKey && "alt",
        key,
      ]
        .filter(Boolean)
        .join("+");

      const action = shortcuts[combo] || shortcuts[key];
      if (action) {
        event.preventDefault();
        action();
      }
    },
    [shortcuts, enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, enabled]);
}

export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  if (shortcut.ctrlKey) parts.push(MAC ? "⌘" : "Ctrl");
  if (shortcut.shiftKey) parts.push(MAC ? "⇧" : "Shift");
  if (shortcut.altKey) parts.push(MAC ? "⌥" : "Alt");
  if (shortcut.metaKey) parts.push(MAC ? "⌘" : "Meta");
  parts.push(shortcut.key.toUpperCase());
  return parts.join(" + ");
}

export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  {
    key: "n",
    description: "New card",
    action: () => {},
    ctrlKey: true,
    global: true,
  },
  {
    key: "b",
    description: "New board",
    action: () => {},
    ctrlKey: true,
    shiftKey: true,
    global: true,
  },
  {
    key: "/",
    description: "Search / Focus capture",
    action: () => {},
    global: true,
  },
  {
    key: "Escape",
    description: "Close modal / Deselect",
    action: () => {},
    global: true,
  },
  {
    key: "a",
    description: "Archive view",
    action: () => {},
    ctrlKey: true,
    global: true,
  },
  {
    key: "d",
    description: "Toggle dark mode",
    action: () => {},
    ctrlKey: true,
    shiftKey: true,
    global: true,
  },
];
