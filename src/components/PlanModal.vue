<script setup lang="ts">
import { RouterLink } from 'vue-router'

const PLAN_MODAL_KEY = 'saw_plan_modal'

function dismiss() {
  try {
    sessionStorage.setItem(PLAN_MODAL_KEY, '1')
  } catch {
    // ignore
  }
  emit('close')
}

const emit = defineEmits<{ close: [] }>()
defineProps<{ open: boolean }>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-modal-title"
    >
      <div class="fixed inset-0 bg-black/50" aria-hidden="true" @click="dismiss" />
      <div class="relative max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
        <h2 id="plan-modal-title" class="text-lg font-semibold text-gray-900">Free vs Paid</h2>
        <p class="mt-3 text-sm text-gray-600">
          <strong>Free:</strong> Add your own API keys in Account to refresh prices and use search.
        </p>
        <p class="mt-2 text-sm text-gray-600">
          <strong>Paid:</strong> Use the app’s keys when you haven’t added your own. You can still add keys to override.
        </p>
        <div class="mt-6 flex flex-wrap gap-3">
          <RouterLink
            to="/account"
            class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            @click="dismiss"
          >
            Upgrade to Paid
          </RouterLink>
          <button
            type="button"
            class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            @click="dismiss"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
