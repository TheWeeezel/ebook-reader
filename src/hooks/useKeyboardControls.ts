import { useRef, useCallback } from 'react';
import { TextInput } from 'react-native';
import { useAppStore } from '../store/appStore';

interface Options {
  onNextPage: () => void;
  onPrevPage: () => void;
  onOpenNotes: () => void;
  onToggleMenu: () => void;
  enabled: boolean;
}

export function useKeyboardControls({
  onNextPage,
  onPrevPage,
  onOpenNotes,
  onToggleMenu,
  enabled,
}: Options) {
  const inputRef = useRef<TextInput>(null);
  const settings = useAppStore((s) => s.settings);

  const handleKeyPress = useCallback(
    (key: string) => {
      if (!enabled) return;

      const binding = settings.keyBindings.find((b) => b.key === key);
      if (!binding || binding.action === 'none') return;

      switch (binding.action) {
        case 'nextPage':
          onNextPage();
          break;
        case 'prevPage':
          onPrevPage();
          break;
        case 'openNotes':
          onOpenNotes();
          break;
        case 'toggleMenu':
          onToggleMenu();
          break;
      }
    },
    [enabled, settings.keyBindings, onNextPage, onPrevPage, onOpenNotes, onToggleMenu]
  );

  const handleRefocus = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  return { inputRef, handleKeyPress, handleRefocus };
}
