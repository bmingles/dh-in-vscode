export class CacheService<T> {
  constructor(loader: (key: string | null) => Promise<T>) {
    this.loader = loader;
  }

  private cachedPromises: Map<string | null, Promise<T>> = new Map();
  private loader: (key: string | null) => Promise<T>;

  public async get(key: string | null): Promise<T> {
    if (!this.cachedPromises.has(key)) {
      // Note that we cache the promise itself, not the result of the promise.
      // This helps ensure the loader is only called the first time `get` is
      // called.
      this.cachedPromises.set(key, this.loader(key));
    }

    return this.cachedPromises.get(key)!;
  }
}
