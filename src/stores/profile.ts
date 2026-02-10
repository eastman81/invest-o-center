import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

export const DASHBOARD_SECTION_IDS = ['favorites', 'top3', 'by_category'] as const
export type DashboardSectionId = (typeof DASHBOARD_SECTION_IDS)[number]

export interface DashboardPrefs {
  sectionOrder: DashboardSectionId[]
  sectionsVisible: Record<DashboardSectionId, boolean>
}

const defaultDashboardPrefs: DashboardPrefs = {
  sectionOrder: [...DASHBOARD_SECTION_IDS],
  sectionsVisible: {
    favorites: true,
    top3: true,
    by_category: true,
  },
}

export function normalizeDashboardPrefs(raw: unknown): DashboardPrefs {
  if (!raw || typeof raw !== 'object') return defaultDashboardPrefs
  const o = raw as Record<string, unknown>
  const order = Array.isArray(o.sectionOrder) ? o.sectionOrder : defaultDashboardPrefs.sectionOrder
  const visible = (o.sectionsVisible && typeof o.sectionsVisible === 'object')
    ? { ...defaultDashboardPrefs.sectionsVisible, ...(o.sectionsVisible as Record<string, boolean>) }
    : defaultDashboardPrefs.sectionsVisible
  return {
    sectionOrder: order.filter((id): id is DashboardSectionId =>
      DASHBOARD_SECTION_IDS.includes(id as DashboardSectionId)
    ).length
      ? (order as DashboardSectionId[])
      : defaultDashboardPrefs.sectionOrder,
    sectionsVisible: { ...defaultDashboardPrefs.sectionsVisible, ...visible },
  }
}

interface ProfileRow {
  id: string
  display_name: string | null
  dashboard_prefs: unknown
  created_at: string
}

export const useProfileStore = defineStore('profile', () => {
  const auth = useAuthStore()
  const profile = ref<ProfileRow | null>(null)

  const dashboardPrefs = computed(() =>
    profile.value ? normalizeDashboardPrefs(profile.value.dashboard_prefs) : defaultDashboardPrefs
  )

  async function load() {
    const userId = auth.user?.id
    if (!userId) {
      profile.value = null
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, dashboard_prefs, created_at')
      .eq('id', userId)
      .single()
    if (error || !data) {
      profile.value = null
      return
    }
    profile.value = data as ProfileRow
  }

  async function updateDisplayName(displayName: string | null) {
    const userId = auth.user?.id
    if (!userId) return
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName?.trim() || null })
      .eq('id', userId)
    if (!error && profile.value) profile.value.display_name = displayName?.trim() || null
    return error
  }

  async function updateDashboardPrefs(prefs: Partial<DashboardPrefs>) {
    const userId = auth.user?.id
    if (!userId) return
    const current = profile.value?.dashboard_prefs as Record<string, unknown> | null
    const merged: DashboardPrefs = {
      ...defaultDashboardPrefs,
      ...(current && typeof current === 'object' ? current : {}),
      ...prefs,
    }
    const { error } = await supabase
      .from('profiles')
      .update({ dashboard_prefs: merged })
      .eq('id', userId)
    if (!error && profile.value) {
      profile.value.dashboard_prefs = merged
    }
    return error
  }

  return {
    profile,
    dashboardPrefs,
    load,
    updateDisplayName,
    updateDashboardPrefs,
  }
})
