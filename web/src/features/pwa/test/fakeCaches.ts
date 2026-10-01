/** Minimal in-memory CacheStorage for jsdom tests (jsdom has none). */
export function installFakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (request: RequestInfo | URL) =>
    new URL(typeof request === "string" ? request : request instanceof URL ? request.href : request.url, "http://localhost").pathname;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (request: RequestInfo | URL, response: Response) => void store.set(keyOf(request), response.clone()),
      match: async (request: RequestInfo | URL) => store.get(keyOf(request))?.clone(),
      delete: async (request: RequestInfo | URL) => store.delete(keyOf(request)),
    };
  };
  const fake = {
    open,
    has: async (name: string) => stores.has(name),
    delete: async (name: string) => stores.delete(name),
    stores,
  };
  Object.defineProperty(globalThis, "caches", { configurable: true, value: fake });
  return fake;
}

export function removeFakeCaches() {
  Reflect.deleteProperty(globalThis, "caches");
}
