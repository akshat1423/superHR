/**
 * localStorage, but only inside a real browser window. Server runtimes (Node 25 included) can expose a global
 * `localStorage` that is incomplete, so check `window` and the method itself. zustand turns persistence off when the
 * getter throws, which is exactly what we want on the server and in tests.
 */
export const browserStorage = (): Storage => {
  if (typeof window !== "undefined" && typeof window.localStorage?.setItem === "function") return window.localStorage;
  throw new Error("no browser storage");
};
