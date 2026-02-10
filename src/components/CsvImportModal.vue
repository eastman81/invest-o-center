<script setup lang="ts">
import { ref, watch } from 'vue'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import type { CategoryDetail } from '@/types/category'

const props = defineProps<{
  open: boolean
  category: CategoryDetail | null
}>()
const emit = defineEmits<{ close: []; imported: [] }>()

const auth = useAuthStore()
const toast = useToastStore()

type Step = 'upload' | 'errors' | 'preview'
const step = ref<Step>('upload')
const fileInput = ref<HTMLInputElement | null>(null)
const validationErrors = ref<{ row: number; message: string }[]>([])
const previewRows = ref<{ name: string; quantity: number; unit_value: number | null; notes: string; category_fields: Record<string, string | number | null> }[]>([])
const importing = ref(false)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      step.value = 'upload'
      validationErrors.value = []
      previewRows.value = []
      if (fileInput.value) fileInput.value.value = ''
    }
  }
)

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_')
}

function parseAndValidate(file: File) {
  if (!props.category) return
  const schemaFields = props.category.schema_fields ?? []
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete(result: { data: Record<string, string>[] }) {
      const rows = result.data ?? []
      const parseErrors: { row: number; message: string }[] = []
      const parsed: typeof previewRows.value = []

      if (rows.length === 0) {
        step.value = 'errors'
        validationErrors.value = [{ row: 0, message: 'No data rows found. CSV must have a header row and at least one data row.' }]
        return
      }

      const rawHeaders = Object.keys(rows[0] ?? {})
      const colMap: Record<string, string> = {}
      rawHeaders.forEach((h) => {
        colMap[normalizeHeader(h)] = h
      })

      const nameCol = rawHeaders.find((h) => normalizeHeader(h) === 'name')
      const qtyCol = rawHeaders.find((h) => normalizeHeader(h) === 'quantity')
      const uvCol = rawHeaders.find((h) => normalizeHeader(h) === 'unit_value' || normalizeHeader(h) === 'unitvalue')
      const notesCol = rawHeaders.find((h) => normalizeHeader(h) === 'notes')

      if (!nameCol) {
        step.value = 'errors'
        validationErrors.value = [{ row: 0, message: 'CSV must have a "Name" or "name" column.' }]
        return
      }
      if (!qtyCol) {
        step.value = 'errors'
        validationErrors.value = [{ row: 0, message: 'CSV must have a "Quantity" or "quantity" column.' }]
        return
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowNum = i + 2
        const name = (row[nameCol] ?? '').trim()
        const qtyStr = String(row[qtyCol] ?? '').trim()
        const uvStr = String(row[uvCol ?? ''] ?? '').trim()
        const notes = String(row[notesCol ?? ''] ?? '').trim()

        if (!name) {
          parseErrors.push({ row: rowNum, message: 'Name is required.' })
          continue
        }
        const qty = qtyStr === '' ? NaN : Number(qtyStr)
        if (Number.isNaN(qty) || qty < 0) {
          parseErrors.push({ row: rowNum, message: 'Quantity must be a number greater than or equal to 0.' })
          continue
        }
        const uv = uvStr === '' ? null : Number(uvStr)
        if (uv !== null && (Number.isNaN(uv) || uv < 0)) {
          parseErrors.push({ row: rowNum, message: 'Unit value must be a number or empty.' })
          continue
        }

        const catFields: Record<string, string | number | null> = {}
        for (const f of schemaFields) {
          const rawVal = row[colMap[normalizeHeader(f.label)] ?? colMap[normalizeHeader(f.key)] ?? '']
          const val = rawVal != null ? String(rawVal).trim() : ''
          if (f.required && !val) {
            parseErrors.push({ row: rowNum, message: `${f.label || f.key} is required.` })
            break
          }
          if (val === '') {
            catFields[f.key] = null
          } else {
            const num = Number(val)
            catFields[f.key] = Number.isNaN(num) ? val : num
          }
        }
        if (parseErrors.some((e) => e.row === rowNum)) continue

        parsed.push({
          name,
          quantity: qty,
          unit_value: uv,
          notes,
          category_fields: catFields,
        })
      }

      if (parseErrors.length > 0) {
        step.value = 'errors'
        validationErrors.value = parseErrors
        return
      }
      step.value = 'preview'
      previewRows.value = parsed
    },
  })
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input?.files?.[0]
  if (!file) return
  if (!props.category) return
  if (!file.name.toLowerCase().endsWith('.csv')) {
    toast.addToast('Please select a CSV file.', 'error')
    return
  }
  parseAndValidate(file)
}

async function doImport() {
  if (!auth.user?.id || !props.category || previewRows.value.length === 0) return
  importing.value = true
  try {
    const toInsert = previewRows.value.map((r) => ({
      user_id: auth.user!.id,
      category_id: props.category!.id,
      name: r.name,
      quantity: r.quantity,
      unit_value: r.unit_value,
      notes: r.notes || null,
      category_fields: r.category_fields,
    }))
    const { error } = await supabase.from('items').insert(toInsert)
    if (error) throw error
    toast.addToast(`${toInsert.length} item(s) imported.`, 'success')
    emit('imported')
    emit('close')
  } catch (e: unknown) {
    const message = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Could not import.'
    toast.addToast(message, 'error')
  } finally {
    importing.value = false
  }
}

function handleBackdropClick(e: MouseEvent) {
  if ((e.target as HTMLElement).hasAttribute?.('data-backdrop')) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-import-title"
    >
      <div data-backdrop class="absolute inset-0 bg-black/50" @click="handleBackdropClick" />
      <div class="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div class="border-b border-gray-200 px-6 py-4 pr-12">
          <button
            type="button"
            class="absolute right-4 top-4 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
            @click="emit('close')"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 id="csv-import-title" class="text-lg font-semibold text-gray-900">
            Import from CSV
          </h2>
          <p class="mt-1 text-sm text-gray-500">
            Upload a CSV with columns: Name, Quantity, Unit value (optional), Notes (optional)<template v-if="category?.schema_fields?.length">, and any category fields (e.g. {{ category.schema_fields.map((f) => f.label).join(', ') }}).</template>
          </p>
        </div>
        <div class="px-6 py-4">
          <div v-if="step === 'upload'" class="space-y-4">
            <label class="block">
              <span class="text-sm font-medium text-gray-700">Select CSV file</span>
              <input
                ref="fileInput"
                type="file"
                accept=".csv"
                class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                @change="onFileChange"
              >
            </label>
            <p class="text-xs text-gray-500">
              <template v-if="category?.schema_fields?.length">
                This category requires extra column(s): <strong>{{ category.schema_fields.filter((f) => f.required).map((f) => f.label).join(', ') || category.schema_fields.map((f) => f.label).join(', ') }}</strong>. Add matching headers in your CSV.
              </template>
              <template v-else>
                Some categories (e.g. Stocks) need extra columns like Ticker—see the column list above if your category has them.
              </template>
            </p>
          </div>
          <div v-else-if="step === 'errors'" class="space-y-3">
            <p class="text-sm font-medium text-red-700">
              Please fix the following errors:
            </p>
            <ul class="list-inside list-disc space-y-1 text-sm text-gray-700">
              <li v-for="(err, idx) in validationErrors" :key="idx">
                Row {{ err.row }}: {{ err.message }}
              </li>
            </ul>
            <button
              type="button"
              class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              @click="step = 'upload'; validationErrors = []"
            >
              Choose another file
            </button>
          </div>
          <div v-else-if="step === 'preview'" class="space-y-4">
            <p class="text-sm text-gray-600">
              {{ previewRows.length }} row(s) ready to import.
            </p>
            <div class="max-h-60 overflow-auto rounded border border-gray-200">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-3 py-2 text-left font-medium text-gray-700">Name</th>
                    <th class="px-3 py-2 text-right font-medium text-gray-700">Qty</th>
                    <th class="px-3 py-2 text-right font-medium text-gray-700">Unit value</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 bg-white">
                  <tr v-for="(r, i) in previewRows.slice(0, 20)" :key="i">
                    <td class="px-3 py-2 text-gray-900">{{ r.name }}</td>
                    <td class="px-3 py-2 text-right text-gray-600">{{ r.quantity }}</td>
                    <td class="px-3 py-2 text-right text-gray-600">{{ r.unit_value ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="previewRows.length > 20" class="text-xs text-gray-500">
              Showing first 20 of {{ previewRows.length }} rows.
            </p>
            <div class="flex gap-3">
              <button
                type="button"
                class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                :disabled="importing"
                @click="step = 'upload'; previewRows = []"
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                :disabled="importing"
                @click="doImport"
              >
                {{ importing ? 'Importing…' : `Import ${previewRows.length} item(s)` }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
