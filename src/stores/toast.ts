import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'error' | 'success' | 'info'

export interface Toast {
  id: number
  message: string
  type: ToastType
  timeoutId: ReturnType<typeof setTimeout>
}

const TOAST_DURATION_MS = 5000
let nextId = 0

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])

  function addToast(message: string, type: ToastType = 'error') {
    const id = nextId++
    const timeoutId = setTimeout(() => {
      removeToast(id)
    }, TOAST_DURATION_MS)
    toasts.value.push({ id, message, type, timeoutId })
  }

  function removeToast(id: number) {
    const t = toasts.value.find((x) => x.id === id)
    if (t) {
      clearTimeout(t.timeoutId)
      toasts.value = toasts.value.filter((x) => x.id !== id)
    }
  }

  return { toasts, addToast, removeToast }
})
