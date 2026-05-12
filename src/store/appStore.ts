import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACCENT_COLORS } from '../theme';

export type BookType = 'pdf' | 'epub' | 'txt';

export interface Book {
  id: string;
  title: string;
  uri: string;
  type: BookType;
  groupId?: string | null;
  lastPage: number;
  lastCfi?: string;
  totalPages: number;
  addedAt: number;
  coverColor?: string;
}

export interface BookGroup {
  id: string;
  name: string;
  createdAt: number;
}

export interface Note {
  id: string;
  bookId: string;
  text: string;
  page?: number;
  cfi?: string;
  createdAt: number;
}

export interface KeyBinding {
  key: string;
  action: 'nextPage' | 'prevPage' | 'openNotes' | 'toggleMenu' | 'none';
  label: string;
}

export interface Settings {
  fontSize: number;
  theme: 'dark' | 'sepia' | 'light';
  lineHeight: number;
  keyBindings: KeyBinding[];
  keepScreenAwake: boolean;
  caseInsensitiveKeys: boolean;
}

// ACCENT_COLORS imported from theme.ts

const DEFAULT_KEY_BINDINGS: KeyBinding[] = [
  { key: 'n', action: 'nextPage', label: 'n' },
  { key: 'p', action: 'prevPage', label: 'p' },
  { key: 'm', action: 'openNotes', label: 'm' },
  { key: ' ', action: 'nextPage', label: 'Leertaste' },
  { key: 'Backspace', action: 'prevPage', label: 'Backspace' },
];

const DEFAULT_SETTINGS: Settings = {
  fontSize: 18,
  theme: 'light',
  lineHeight: 1.7,
  keyBindings: DEFAULT_KEY_BINDINGS,
  keepScreenAwake: true,
  caseInsensitiveKeys: true,
};

const sanitizeBookTitle = (rawTitle: string): string => {
  const base = rawTitle.replace(/\.[^/.]+$/, '');
  const cleaned = base
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'Untitled';

  return cleaned
    .split(' ')
    .map((word) => {
      if (!word) return '';
      if (/^\d+$/.test(word)) return word;

      if (
        word.length <= 4 &&
        /^[A-Z0-9]+$/.test(word) &&
        word === word.toUpperCase()
      ) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(' ');
};

interface AppState {
  books: Book[];
  groups: BookGroup[];
  notes: Record<string, Note[]>;
  settings: Settings;
  currentBook: Book | null;
  initialized: boolean;

  init: () => Promise<void>;
  addBook: (book: Omit<Book, 'id' | 'addedAt' | 'coverColor'>) => Promise<void>;
  removeBook: (id: string) => Promise<void>;
  setCurrentBook: (book: Book | null) => void;
  updateBookProgress: (id: string, page: number, cfi?: string, totalPages?: number) => Promise<void>;
  addGroup: (name: string) => Promise<BookGroup | null>;
  assignBooksToGroup: (bookIds: string[], groupId: string | null) => Promise<void>;
  removeGroup: (groupId: string) => Promise<void>;

  addNote: (note: Omit<Note, 'id' | 'createdAt'>) => Promise<void>;
  updateNote: (bookId: string, noteId: string, text: string) => Promise<void>;
  deleteNote: (bookId: string, noteId: string) => Promise<void>;

  updateSettings: (partial: Partial<Settings>) => Promise<void>;
  updateKeyBinding: (index: number, binding: Partial<KeyBinding>) => Promise<void>;
}

const saveLibrary = async (books: Book[]) => {
  await AsyncStorage.setItem('library', JSON.stringify(books));
};

const saveGroups = async (groups: BookGroup[]) => {
  await AsyncStorage.setItem('groups', JSON.stringify(groups));
};

const saveNotes = async (notes: Record<string, Note[]>) => {
  await AsyncStorage.setItem('notes', JSON.stringify(notes));
};

const saveSettings = async (settings: Settings) => {
  await AsyncStorage.setItem('settings', JSON.stringify(settings));
};

export const useAppStore = create<AppState>((set, get) => ({
  books: [],
  groups: [],
  notes: {},
  settings: DEFAULT_SETTINGS,
  currentBook: null,
  initialized: false,

  init: async () => {
    try {
      const [libraryStr, groupsStr, notesStr, settingsStr] = await Promise.all([
        AsyncStorage.getItem('library'),
        AsyncStorage.getItem('groups'),
        AsyncStorage.getItem('notes'),
        AsyncStorage.getItem('settings'),
      ]);
      const books = libraryStr
        ? (JSON.parse(libraryStr) as Book[]).map((b) => ({
            ...b,
            title: sanitizeBookTitle(b.title),
            groupId: b.groupId ?? null,
          }))
        : [];
      const groups = groupsStr ? JSON.parse(groupsStr) : [];
      const notes = notesStr ? JSON.parse(notesStr) : {};
      const parsed = settingsStr ? JSON.parse(settingsStr) : {};
      // Strip the legacy on-device anthropicApiKey if it lingered in old
      // AsyncStorage state; the key now lives in Secret Manager server-side.
      if (parsed.anthropicApiKey) {
        delete parsed.anthropicApiKey;
        await AsyncStorage.setItem('settings', JSON.stringify(parsed));
      }
      const settings = { ...DEFAULT_SETTINGS, ...parsed };
      set({ books, groups, notes, settings, initialized: true });
    } catch {
      set({ initialized: true });
    }
  },

  addBook: async (bookData) => {
    const { books } = get();
    const colorIndex = books.length % ACCENT_COLORS.length;
    const book: Book = {
      ...bookData,
      title: sanitizeBookTitle(bookData.title),
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      addedAt: Date.now(),
      coverColor: ACCENT_COLORS[colorIndex],
      groupId: bookData.groupId ?? null,
    };
    const newBooks = [book, ...books];
    set({ books: newBooks });
    await saveLibrary(newBooks);
  },

  removeBook: async (id) => {
    const { books, notes } = get();
    const newBooks = books.filter((b) => b.id !== id);
    const newNotes = { ...notes };
    delete newNotes[id];
    set({ books: newBooks, notes: newNotes });
    await Promise.all([saveLibrary(newBooks), saveNotes(newNotes)]);
  },

  setCurrentBook: (book) => set({ currentBook: book }),

  addGroup: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const { groups } = get();
    const existing = groups.find((g) => g.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;

    const group: BookGroup = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: trimmed,
      createdAt: Date.now(),
    };
    const newGroups = [...groups, group].sort((a, b) => a.name.localeCompare(b.name));
    set({ groups: newGroups });
    await saveGroups(newGroups);
    return group;
  },

  assignBooksToGroup: async (bookIds, groupId) => {
    if (!bookIds.length) return;
    const idSet = new Set(bookIds);
    const normalizedGroupId = groupId ?? null;

    const { books, currentBook } = get();
    const newBooks = books.map((b) =>
      idSet.has(b.id)
        ? {
            ...b,
            groupId: normalizedGroupId,
          }
        : b
    );

    const updatedCurrent =
      currentBook && idSet.has(currentBook.id)
        ? {
            ...currentBook,
            groupId: normalizedGroupId,
          }
        : currentBook;

    set({ books: newBooks, currentBook: updatedCurrent });
    await saveLibrary(newBooks);
  },

  removeGroup: async (groupId) => {
    const { groups, books, currentBook } = get();
    const newGroups = groups.filter((g) => g.id !== groupId);
    const newBooks = books.map((b) =>
      b.groupId === groupId
        ? {
            ...b,
            groupId: null,
          }
        : b
    );

    const updatedCurrent =
      currentBook?.groupId === groupId
        ? {
            ...currentBook,
            groupId: null,
          }
        : currentBook;

    set({ groups: newGroups, books: newBooks, currentBook: updatedCurrent });
    await Promise.all([saveGroups(newGroups), saveLibrary(newBooks)]);
  },

  updateBookProgress: async (id, page, cfi, totalPages) => {
    const { books } = get();
    const newBooks = books.map((b) => {
      if (b.id !== id) return b;
      return {
        ...b,
        lastPage: page,
        ...(cfi !== undefined && { lastCfi: cfi }),
        ...(totalPages !== undefined && { totalPages }),
      };
    });
    const currentBook = get().currentBook;
    const updatedCurrent =
      currentBook?.id === id
        ? {
            ...currentBook,
            lastPage: page,
            ...(cfi !== undefined && { lastCfi: cfi }),
            ...(totalPages !== undefined && { totalPages }),
          }
        : currentBook;
    set({ books: newBooks, currentBook: updatedCurrent });
    await saveLibrary(newBooks);
  },

  addNote: async (noteData) => {
    const { notes } = get();
    const note: Note = {
      ...noteData,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      createdAt: Date.now(),
    };
    const bookNotes = notes[noteData.bookId] || [];
    const newNotes = { ...notes, [noteData.bookId]: [note, ...bookNotes] };
    set({ notes: newNotes });
    await saveNotes(newNotes);
  },

  updateNote: async (bookId, noteId, text) => {
    const { notes } = get();
    const bookNotes = notes[bookId] || [];
    const newBookNotes = bookNotes.map((n) =>
      n.id === noteId ? { ...n, text } : n
    );
    const newNotes = { ...notes, [bookId]: newBookNotes };
    set({ notes: newNotes });
    await saveNotes(newNotes);
  },

  deleteNote: async (bookId, noteId) => {
    const { notes } = get();
    const bookNotes = notes[bookId] || [];
    const newBookNotes = bookNotes.filter((n) => n.id !== noteId);
    const newNotes = { ...notes, [bookId]: newBookNotes };
    set({ notes: newNotes });
    await saveNotes(newNotes);
  },

  updateSettings: async (partial) => {
    const { settings } = get();
    const newSettings = { ...settings, ...partial };
    set({ settings: newSettings });
    await saveSettings(newSettings);
  },

  updateKeyBinding: async (index, binding) => {
    const { settings } = get();
    const newBindings = [...settings.keyBindings];
    newBindings[index] = { ...newBindings[index], ...binding };
    const newSettings = { ...settings, keyBindings: newBindings };
    set({ settings: newSettings });
    await saveSettings(newSettings);
  },
}));
