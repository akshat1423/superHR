import { create } from "zustand";

interface ToastState { message: string | null; seq: number; show: (m: string) => void; hide: () => void }
export const useToast = create<ToastState>((set) => ({
  message: null,
  seq: 0,
  show: (message) => set((s) => ({ message, seq: s.seq + 1 })),
  hide: () => set({ message: null }),
}));
export const toast = (m: string) => useToast.getState().show(m);
