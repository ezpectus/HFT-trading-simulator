import { create } from 'zustand'

let toastId = 0

export const useToastStore = create((set) => ({
  toasts: [],
  addToast: (typeOrObj, messageOrDuration, durationArg) => {
    const id = ++toastId
    let type, message, duration
    if (typeof typeOrObj === 'object') {
      type = typeOrObj.type
      message = typeOrObj.title ? `${typeOrObj.title}: ${typeOrObj.message}` : typeOrObj.message
      duration = typeOrObj.duration ?? 5000
    } else {
      type = typeOrObj
      message = messageOrDuration
      duration = durationArg ?? 5000
    }
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, type, message, duration }] }))
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, duration)
    }
    return id
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clearAll: () => set({ toasts: [] }),
}))
