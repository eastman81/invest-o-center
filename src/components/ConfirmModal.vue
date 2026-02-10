<script setup lang="ts">
defineProps<{
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmLoading?: boolean
  /** Shown when confirmLoading is true; defaults to "Deleting…". */
  confirmLoadingLabel?: string
}>()
const emit = defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'confirm-modal-title'"
    >
      <div
        class="absolute inset-0 bg-black/50"
        @click="emit('close')"
      />
      <div class="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 :id="'confirm-modal-title'" class="text-lg font-semibold text-gray-900">
          {{ title }}
        </h2>
        <p class="mt-2 text-gray-600">
          {{ message }}
        </p>
        <div class="mt-6 flex gap-3">
          <button
            type="button"
            class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            :disabled="confirmLoading"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            :disabled="confirmLoading"
            @click="emit('confirm')"
          >
            {{ confirmLoading ? (confirmLoadingLabel ?? 'Deleting…') : (confirmLabel ?? 'Delete') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
