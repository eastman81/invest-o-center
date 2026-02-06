<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useToastStore } from '@/stores/toast'

const toastStore = useToastStore()
const { toasts } = storeToRefs(toastStore)

function dismiss(id: number) {
  toastStore.removeToast(id)
}

const typeClasses: Record<string, string> = {
  error: 'bg-red-50 text-red-800 border-red-200',
  success: 'bg-green-50 text-green-800 border-green-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
}
</script>

<template>
  <div
    class="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
    role="region"
    aria-label="Notifications"
  >
    <div
      v-for="t in toasts"
      :key="t.id"
      :class="['flex items-center justify-between gap-3 rounded-lg border px-4 py-3 shadow-lg', typeClasses[t.type] || typeClasses.info]"
    >
      <p class="text-sm font-medium">{{ t.message }}</p>
      <button
        type="button"
        class="shrink-0 rounded p-1 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-1"
        :aria-label="'Dismiss'"
        @click="dismiss(t.id)"
      >
        <span class="sr-only">Dismiss</span>
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>
