export class CacheService<T> {
  constructor(loader: () => Promise<T>) {
    this.loader = loader;
  }

  private cachedPromise: Promise<T> | null = null;
  private loader: () => Promise<T>;

  public async get(): Promise<T> {
    if (this.cachedPromise == null) {
      // Note that we cache the promise itself, not the result of the promise.
      // This helps ensure the loader is only called the first time `get` is
      // called.
      this.cachedPromise = this.loader();
    }

    return this.cachedPromise;
  }
}
