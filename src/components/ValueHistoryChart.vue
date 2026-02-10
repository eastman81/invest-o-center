<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Chart, registerables } from 'chart.js'
import type { ValueSeries } from '@/lib/valueHistory'

Chart.register(...registerables)

const props = withDefaults(
  defineProps<{
    series: ValueSeries[]
    /** Time range in days for display (labels). */
    timeRangeDays?: number
    /** If true, show a single aggregated line instead of one per series. */
    showAsTotal?: boolean
    /** Empty state message when no data. */
    emptyMessage?: string
    /** Sparkline style: no axes, no legend, small dots and line. */
    minimal?: boolean
  }>(),
  {
    timeRangeDays: 30,
    showAsTotal: false,
    emptyMessage: 'No history yet. History builds after the first daily snapshot or after you refresh prices.',
    minimal: false,
  }
)

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null

/** 15 colors for series (dots + lines). */
const SERIES_COLORS = [
  '#b45309', // amber-700
  '#0c4a6e', // sky-900
  '#9f1239', // rose-800
  '#065f46', // emerald-800
  '#4c1d95', // violet-800
  '#713f12', // amber-900
  '#0369a1', // sky-700
  '#be123c', // rose-700
  '#047857', // emerald-700
  '#5b21b6', // violet-700
  '#92400e', // amber-800
  '#0284c7', // sky-600
  '#e11d48', // rose-600
  '#059669', // emerald-600
  '#6d28d9', // violet-600
]

function getSeriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]
}

function buildDatasets() {
  if (props.series.length === 0) return []
  if (props.showAsTotal && props.series.length > 1) {
    const labels = getLabels()
    const data = labels.map((date) =>
      props.series.reduce((sum, s) => sum + (s.data.find((d) => d.date === date)?.value ?? 0), 0)
    )
    const pointRadius = props.minimal ? 2 : 4
    const pointHoverRadius = props.minimal ? 4 : 6
    const primaryColor = '#4f46e5'
    return [
      {
        label: 'Total',
        data,
        borderColor: primaryColor,
        backgroundColor: primaryColor,
        tension: 0.2,
        fill: false,
        pointRadius,
        pointHoverRadius,
      },
    ]
  }
  const pointRadius = props.minimal ? 2 : 4
  const pointHoverRadius = props.minimal ? 4 : 6
  const primaryColor = '#4f46e5'
  return props.series.map((s, i) => {
    const color = props.minimal && props.series.length === 1 ? primaryColor : (s.color ?? getSeriesColor(i))
    const values = s.data.map((d) => d.value)
    return {
      label: s.label,
      data: values,
      borderColor: color,
      backgroundColor: color,
      tension: 0.2,
      fill: false,
      pointRadius,
      pointHoverRadius,
    }
  })
}

function getLabels(): string[] {
  if (props.series.length === 0) return []
  const first = props.series[0]
  if (!first || first.data.length === 0) return []
  return first.data.map((d) => d.date)
}

function updateChart() {
  if (!canvasRef.value || props.series.length === 0) return
  const labels = getLabels()
  const datasets = buildDatasets()
  if (chartInstance) {
    chartInstance.data.labels = labels
    chartInstance.data.datasets = datasets as never
    chartInstance.update()
    return
  }
  const minimal = props.minimal
  chartInstance = new Chart(canvasRef.value, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: !minimal && props.series.length <= 10, position: 'bottom' },
        tooltip: minimal
          ? {}
          : {
              callbacks: {
                label(ctx) {
                  const v = ctx.parsed.y ?? 0
                  return `${ctx.dataset.label}: $${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                },
              },
            },
      },
      scales: {
        x: { display: !minimal, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: {
          display: !minimal,
          beginAtZero: true,
          ticks: minimal
            ? {}
            : {
                callback(value) {
                  return typeof value === 'number' ? '$' + value.toLocaleString() : value
                },
              },
        },
      },
    },
  })
}

function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
}

onMounted(() => {
  if (props.series.length > 0) updateChart()
})

onBeforeUnmount(destroyChart)

watch(
  () => [props.series, props.showAsTotal, props.minimal],
  () => {
    if (props.series.length === 0) {
      destroyChart()
      return
    }
    updateChart()
  },
  { deep: true }
)
</script>

<template>
  <div class="relative w-full" :class="minimal ? 'h-[90px] max-h-[90px]' : 'h-[280px]'">
    <template v-if="series.length === 0">
      <div
        v-if="!minimal"
        class="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50/50 text-sm text-gray-500"
      >
        {{ emptyMessage }}
      </div>
    </template>
    <template v-else>
      <canvas ref="canvasRef" class="w-full"></canvas>
    </template>
  </div>
</template>
