import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACCENT_COLORS } from '../theme';

export type BookType = 'pdf' | 'epub' | 'txt';

export interface Book {
  id: string;
  title: string;
  uri: string;
  type: BookType;
  lastPage: number;
  lastCfi?: string;
  totalPages: number;
  addedAt: number;
  coverColor?: string;
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
};

interface AppState {
  books: Book[];
  notes: Record<string, Note[]>;
  settings: Settings;
  currentBook: Book | null;
  initialized: boolean;

  init: () => Promise<void>;
  addBook: (book: Omit<Book, 'id' | 'addedAt' | 'coverColor'>) => Promise<void>;
  removeBook: (id: string) => Promise<void>;
  setCurrentBook: (book: Book | null) => void;
  updateBookProgress: (id: string, page: number, cfi?: string, totalPages?: number) => Promise<void>;

  addNote: (note: Omit<Note, 'id' | 'createdAt'>) => Promise<void>;
  updateNote: (bookId: string, noteId: string, text: string) => Promise<void>;
  deleteNote: (bookId: string, noteId: string) => Promise<void>;

  updateSettings: (partial: Partial<Settings>) => Promise<void>;
  updateKeyBinding: (index: number, binding: Partial<KeyBinding>) => Promise<void>;
}

const saveLibrary = async (books: Book[]) => {
  await AsyncStorage.setItem('library', JSON.stringify(books));
};

const saveNotes = async (notes: Record<string, Note[]>) => {
  await AsyncStorage.setItem('notes', JSON.stringify(notes));
};

const saveSettings = async (settings: Settings) => {
  await AsyncStorage.setItem('settings', JSON.stringify(settings));
};

export const useAppStore = create<AppState>((set, get) => ({
  books: [],
  notes: {},
  settings: DEFAULT_SETTINGS,
  currentBook: null,
  initialized: false,

  init: async () => {
    try {
      const [libraryStr, notesStr, settingsStr] = await Promise.all([
        AsyncStorage.getItem('library'),
        AsyncStorage.getItem('notes'),
        AsyncStorage.getItem('settings'),
      ]);
      const books = libraryStr ? JSON.parse(libraryStr) : [];
      const notes = notesStr ? JSON.parse(notesStr) : {};
      const settings = settingsStr
        ? { ...DEFAULT_SETTINGS, ...JSON.parse(settingsStr) }
        : DEFAULT_SETTINGS;
      set({ books, notes, settings, initialized: true });
    } catch {
      set({ initialized: true });
    }
  },

  addBook: async (bookData) => {
    const { books } = get();
    const colorIndex = books.length % ACCENT_COLORS.length;
    const book: Book = {
      ...bookData,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      addedAt: Date.now(),
      coverColor: ACCENT_COLORS[colorIndex],
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
