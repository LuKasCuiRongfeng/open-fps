// EditorCommandHistory: async undo/redo command stack for editor mutations.
// EditorCommandHistory：编辑器变更使用的异步撤销/重做命令栈。

export interface EditorCommand {
  readonly label: string;
  undo(): Promise<void> | void;
  redo(): Promise<void> | void;
}

export interface EditorHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
}

export class EditorCommandHistory {
  private readonly undoStack: EditorCommand[] = [];
  private readonly redoStack: EditorCommand[] = [];
  private readonly maxEntries: number;
  private busy = false;

  constructor(maxEntries = 64) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  getState(): EditorHistoryState {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      busy: this.busy,
    };
  }

  record(command: EditorCommand): void {
    this.undoStack.push(command);
    this.redoStack.length = 0;
    while (this.undoStack.length > this.maxEntries) {
      this.undoStack.shift();
    }
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.busy = false;
  }

  async undo(): Promise<boolean> {
    if (this.busy) return false;
    const command = this.undoStack.pop();
    if (!command) return false;

    this.busy = true;
    try {
      await command.undo();
      this.redoStack.push(command);
      return true;
    } catch (error) {
      this.undoStack.push(command);
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async redo(): Promise<boolean> {
    if (this.busy) return false;
    const command = this.redoStack.pop();
    if (!command) return false;

    this.busy = true;
    try {
      await command.redo();
      this.undoStack.push(command);
      return true;
    } catch (error) {
      this.redoStack.push(command);
      throw error;
    } finally {
      this.busy = false;
    }
  }
}