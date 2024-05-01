import * as vscode from 'vscode';

const EVENT_EMIT_DEBOUNCE = 5;

export class DebouncedEventQueue {
  private _handle: NodeJS.Timeout | undefined;
  private readonly _eventQueue: vscode.FileChangeEvent[] = [];
  private readonly emitter = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();

  get event() {
    return this.emitter.event;
  }

  enqueue(...events: vscode.FileChangeEvent[]) {
    this._eventQueue.push(...events);

    if (this._handle) {
      clearTimeout(this._handle);
    }

    this._handle = setTimeout(() => {
      this.emitter.fire(this._eventQueue);
      this._eventQueue.length = 0;
    }, EVENT_EMIT_DEBOUNCE);
  }
}
