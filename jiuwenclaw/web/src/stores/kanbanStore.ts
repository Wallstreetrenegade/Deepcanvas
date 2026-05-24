import { create } from 'zustand';
import { mirrorFeatureState } from '../services/piMirror';
import { webRequest } from '../services/webClient';

const STORAGE_KEY = 'deep_canvas_kanban_v1';

export interface KanbanSubtask {
  id: string;
  title: string;
}

export interface KanbanEntry {
  id: string;
  title: string;
  notes: string;
  subtasks: KanbanSubtask[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
}

export interface KanbanCard {
  id: string;
  title: string;
  notes: string;
  columnId: string;
  subtasks: KanbanSubtask[];
  parentTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

interface KanbanSnapshot {
  entries: KanbanEntry[];
  columns: KanbanColumn[];
  cards: KanbanCard[];
}

interface CreateEntryInput {
  title: string;
  notes?: string;
  subtasks?: string[];
}

interface KanbanState extends KanbanSnapshot {
  hydrate: () => Promise<void>;
  addEntry: (input: CreateEntryInput) => void;
  updateEntry: (entryId: string, updates: Partial<Pick<KanbanEntry, 'title' | 'notes'>>) => void;
  deleteEntry: (entryId: string) => void;
  addEntrySubtask: (entryId: string, title: string) => void;
  updateEntrySubtask: (entryId: string, subtaskId: string, title: string) => void;
  deleteEntrySubtask: (entryId: string, subtaskId: string) => void;
  addColumn: (title: string) => void;
  updateColumn: (columnId: string, title: string) => void;
  deleteColumn: (columnId: string) => void;
  addManualCard: (columnId?: string) => void;
  addCardFromEntry: (entryId: string, columnId?: string) => void;
  addCardFromSubtask: (entryId: string, subtaskId: string, columnId?: string) => void;
  updateCard: (cardId: string, updates: Partial<Pick<KanbanCard, 'title' | 'notes'>>) => void;
  updateCardSubtask: (cardId: string, subtaskId: string, title: string) => void;
  addCardSubtask: (cardId: string, title: string) => void;
  deleteCardSubtask: (cardId: string, subtaskId: string) => void;
  moveCard: (cardId: string, columnId: string) => void;
  deleteCard: (cardId: string) => void;
  resetBoard: () => void;
}

interface PiStateResponse {
  feature?: string;
  data?: unknown;
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' },
];

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function timestamp(): string {
  return new Date().toISOString();
}

function createDefaultSnapshot(): KanbanSnapshot {
  return {
    entries: [],
    columns: DEFAULT_COLUMNS,
    cards: [],
  };
}

function normalizeSnapshot(value: unknown): KanbanSnapshot {
  const fallback = createDefaultSnapshot();
  if (!value || typeof value !== 'object') return fallback;
  const parsed = value as Partial<KanbanSnapshot>;
  return {
    entries: Array.isArray(parsed.entries) ? parsed.entries : fallback.entries,
    columns: Array.isArray(parsed.columns) && parsed.columns.length > 0 ? parsed.columns : fallback.columns,
    cards: Array.isArray(parsed.cards) ? parsed.cards : fallback.cards,
  };
}

function loadSnapshot(): KanbanSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSnapshot();
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return createDefaultSnapshot();
  }
}

function persistSnapshot(snapshot: KanbanSnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage failures
  }
}

function commitSnapshot(
  set: (partial: KanbanSnapshot | Partial<KanbanState> | ((state: KanbanState) => KanbanSnapshot)) => void,
  snapshotOrUpdater: KanbanSnapshot | ((state: KanbanState) => KanbanSnapshot)
) {
  set((state) => {
    const nextSnapshot =
      typeof snapshotOrUpdater === 'function'
        ? snapshotOrUpdater(state)
        : snapshotOrUpdater;

    persistSnapshot(nextSnapshot);
    return nextSnapshot;
  });
}

function getPrimaryColumnId(columns: KanbanColumn[]): string {
  return columns[0]?.id ?? 'todo';
}

const initialSnapshot = loadSnapshot();

export const useKanbanStore = create<KanbanState>((set) => ({
  ...initialSnapshot,

  hydrate: async () => {
    try {
      const response = await webRequest<PiStateResponse>('pi.state.get', { feature: 'kanban' });
      const remote = response?.data;
      if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return;
      const snapshot = normalizeSnapshot(remote);
      persistSnapshot(snapshot);
      set(snapshot);
    } catch {
      // Local browser state remains usable if the backend mirror is unavailable.
    }
  },

  addEntry: (input) => {
    const now = timestamp();
    const title = input.title.trim();
    if (!title) return;

    const nextEntry: KanbanEntry = {
      id: makeId('entry'),
      title,
      notes: input.notes?.trim() ?? '',
      subtasks: (input.subtasks ?? [])
        .map((subtask) => subtask.trim())
        .filter(Boolean)
        .map((subtaskTitle) => ({ id: makeId('subtask'), title: subtaskTitle })),
      createdAt: now,
      updatedAt: now,
    };

    commitSnapshot(set, (state) => ({
      entries: [nextEntry, ...state.entries],
      columns: state.columns,
      cards: state.cards,
    }));
  },

  updateEntry: (entryId, updates) => {
    commitSnapshot(set, (state) => ({
      entries: state.entries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              ...updates,
              title: updates.title !== undefined ? updates.title : entry.title,
              notes: updates.notes !== undefined ? updates.notes : entry.notes,
              updatedAt: timestamp(),
            }
          : entry
      ),
      columns: state.columns,
      cards: state.cards,
    }));
  },

  deleteEntry: (entryId) => {
    commitSnapshot(set, (state) => ({
      entries: state.entries.filter((entry) => entry.id !== entryId),
      columns: state.columns,
      cards: state.cards,
    }));
  },

  addEntrySubtask: (entryId, title) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    commitSnapshot(set, (state) => ({
      entries: state.entries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              subtasks: [...entry.subtasks, { id: makeId('subtask'), title: cleanTitle }],
              updatedAt: timestamp(),
            }
          : entry
      ),
      columns: state.columns,
      cards: state.cards,
    }));
  },

  updateEntrySubtask: (entryId, subtaskId, title) => {
    commitSnapshot(set, (state) => ({
      entries: state.entries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              subtasks: entry.subtasks.map((subtask) =>
                subtask.id === subtaskId ? { ...subtask, title } : subtask
              ),
              updatedAt: timestamp(),
            }
          : entry
      ),
      columns: state.columns,
      cards: state.cards,
    }));
  },

  deleteEntrySubtask: (entryId, subtaskId) => {
    commitSnapshot(set, (state) => ({
      entries: state.entries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              subtasks: entry.subtasks.filter((subtask) => subtask.id !== subtaskId),
              updatedAt: timestamp(),
            }
          : entry
      ),
      columns: state.columns,
      cards: state.cards,
    }));
  },

  addColumn: (title) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    commitSnapshot(set, (state) => ({
      entries: state.entries,
      columns: [...state.columns, { id: makeId('column'), title: cleanTitle }],
      cards: state.cards,
    }));
  },

  updateColumn: (columnId, title) => {
    commitSnapshot(set, (state) => ({
      entries: state.entries,
      columns: state.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
      cards: state.cards,
    }));
  },

  deleteColumn: (columnId) => {
    commitSnapshot(set, (state) => {
      if (state.columns.length <= 1) {
        return state;
      }

      const nextColumns = state.columns.filter((column) => column.id !== columnId);
      const fallbackColumnId = getPrimaryColumnId(nextColumns);

      return {
        entries: state.entries,
        columns: nextColumns,
        cards: state.cards.map((card) =>
          card.columnId === columnId ? { ...card, columnId: fallbackColumnId, updatedAt: timestamp() } : card
        ),
      };
    });
  },

  addManualCard: (columnId) => {
    commitSnapshot(set, (state) => {
      const targetColumnId = columnId ?? getPrimaryColumnId(state.columns);
      const now = timestamp();
      return {
        entries: state.entries,
        columns: state.columns,
        cards: [
          ...state.cards,
          {
            id: makeId('card'),
            title: 'New Task',
            notes: '',
            columnId: targetColumnId,
            subtasks: [],
            parentTitle: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
    });
  },

  addCardFromEntry: (entryId, columnId) => {
    commitSnapshot(set, (state) => {
      const entry = state.entries.find((item) => item.id === entryId);
      if (!entry) return state;

      const now = timestamp();

      return {
        entries: state.entries,
        columns: state.columns,
        cards: [
          ...state.cards,
          {
            id: makeId('card'),
            title: entry.title,
            notes: entry.notes,
            columnId: columnId ?? getPrimaryColumnId(state.columns),
            subtasks: entry.subtasks.map((subtask) => ({ ...subtask })),
            parentTitle: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
    });
  },

  addCardFromSubtask: (entryId, subtaskId, columnId) => {
    commitSnapshot(set, (state) => {
      const entry = state.entries.find((item) => item.id === entryId);
      const subtask = entry?.subtasks.find((item) => item.id === subtaskId);
      if (!entry || !subtask) return state;

      const now = timestamp();
      return {
        entries: state.entries,
        columns: state.columns,
        cards: [
          ...state.cards,
          {
            id: makeId('card'),
            title: subtask.title,
            notes: '',
            columnId: columnId ?? getPrimaryColumnId(state.columns),
            subtasks: [],
            parentTitle: entry.title,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
    });
  },

  updateCard: (cardId, updates) => {
    commitSnapshot(set, (state) => ({
      entries: state.entries,
      columns: state.columns,
      cards: state.cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              ...updates,
              updatedAt: timestamp(),
            }
          : card
      ),
    }));
  },

  updateCardSubtask: (cardId, subtaskId, title) => {
    commitSnapshot(set, (state) => ({
      entries: state.entries,
      columns: state.columns,
      cards: state.cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              subtasks: card.subtasks.map((subtask) =>
                subtask.id === subtaskId ? { ...subtask, title } : subtask
              ),
              updatedAt: timestamp(),
            }
          : card
      ),
    }));
  },

  addCardSubtask: (cardId, title) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    commitSnapshot(set, (state) => ({
      entries: state.entries,
      columns: state.columns,
      cards: state.cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              subtasks: [...card.subtasks, { id: makeId('subtask'), title: cleanTitle }],
              updatedAt: timestamp(),
            }
          : card
      ),
    }));
  },

  deleteCardSubtask: (cardId, subtaskId) => {
    commitSnapshot(set, (state) => ({
      entries: state.entries,
      columns: state.columns,
      cards: state.cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              subtasks: card.subtasks.filter((subtask) => subtask.id !== subtaskId),
              updatedAt: timestamp(),
            }
          : card
      ),
    }));
  },

  moveCard: (cardId, columnId) => {
    commitSnapshot(set, (state) => ({
      entries: state.entries,
      columns: state.columns,
      cards: state.cards.map((card) =>
        card.id === cardId
          ? { ...card, columnId, updatedAt: timestamp() }
          : card
      ),
    }));
  },

  deleteCard: (cardId) => {
    commitSnapshot(set, (state) => ({
      entries: state.entries,
      columns: state.columns,
      cards: state.cards.filter((card) => card.id !== cardId),
    }));
  },

  resetBoard: () => {
    const nextSnapshot = createDefaultSnapshot();
    persistSnapshot(nextSnapshot);
    set(nextSnapshot);
  },
}));

// Silent PI-agent mirror: pushes the Kanban snapshot to the backend so
// the main chat agent stays aware of the board. No UI, no buttons.
useKanbanStore.subscribe((state) => {
  mirrorFeatureState('kanban', {
    columns: state.columns,
    cards: state.cards,
    entries: state.entries,
  });
});
mirrorFeatureState('kanban', {
  columns: useKanbanStore.getState().columns,
  cards: useKanbanStore.getState().cards,
  entries: useKanbanStore.getState().entries,
});
