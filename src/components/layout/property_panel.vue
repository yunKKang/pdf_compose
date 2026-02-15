<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

defineProps<{
  selectedCount: number
  pageWidthPt: number
  pageHeightPt: number
}>()

const emit = defineEmits<{
  updatePageSize: [payload: { widthPt: number; heightPt: number; label: string }]
}>()

const MM_TO_PT = 72 / 25.4

const sizePresets = [
  { id: 'a4_landscape', label: 'A4 横向', widthMm: 297, heightMm: 210 },
  { id: 'a4_portrait', label: 'A4 纵向', widthMm: 210, heightMm: 297 },
  { id: 'a3_landscape', label: 'A3 横向', widthMm: 420, heightMm: 297 },
  { id: 'letter_landscape', label: 'Letter 横向', widthMm: 279.4, heightMm: 215.9 },
] as const

const sizeMode = ref<'preset' | 'custom'>('preset')
const presetId = ref<(typeof sizePresets)[number]['id']>('a4_landscape')
const customWidthMm = ref(297)
const customHeightMm = ref(210)

const currentMmLabel = computed(() => {
  const widthMm = (Number.isFinite(customWidthMm.value) ? customWidthMm.value : 297).toFixed(1)
  const heightMm = (Number.isFinite(customHeightMm.value) ? customHeightMm.value : 210).toFixed(1)
  return `${widthMm} x ${heightMm} mm`
})

const toPt = (mm: number) => Math.max(20, Math.round(mm * MM_TO_PT * 100) / 100)

const emitPresetSize = () => {
  const currentPreset = sizePresets.find((item) => item.id === presetId.value)
  if (!currentPreset) {
    return
  }

  customWidthMm.value = currentPreset.widthMm
  customHeightMm.value = currentPreset.heightMm
  emit('updatePageSize', {
    widthPt: toPt(currentPreset.widthMm),
    heightPt: toPt(currentPreset.heightMm),
    label: currentPreset.label,
  })
}

const applyCustomSize = () => {
  const widthMm = Math.max(80, Number.isFinite(customWidthMm.value) ? customWidthMm.value : 297)
  const heightMm = Math.max(80, Number.isFinite(customHeightMm.value) ? customHeightMm.value : 210)
  customWidthMm.value = widthMm
  customHeightMm.value = heightMm
  emit('updatePageSize', {
    widthPt: toPt(widthMm),
    heightPt: toPt(heightMm),
    label: `自定义 ${widthMm.toFixed(1)}x${heightMm.toFixed(1)}mm`,
  })
}

watch(
  () => presetId.value,
  () => {
    if (sizeMode.value !== 'preset') {
      return
    }

    emitPresetSize()
  },
)

watch(
  () => sizeMode.value,
  (mode) => {
    if (mode === 'preset') {
      emitPresetSize()
      return
    }

    applyCustomSize()
  },
)

onMounted(() => {
  emitPresetSize()
})
</script>

<template>
  <aside class="flex h-full w-[260px] flex-col border-l border-slate-200 bg-white/80 p-4">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">属性面板</h2>
    <p class="mt-2 text-sm text-slate-700">当前选择 {{ selectedCount }} 页</p>

    <div class="mt-4 space-y-2 text-xs text-slate-600">
      <div class="rounded border border-slate-200 bg-slate-50 p-2">
        <p class="font-semibold text-slate-700">导出尺寸</p>
        <p class="mt-1">当前：{{ Math.round(pageWidthPt) }} x {{ Math.round(pageHeightPt) }} pt</p>
        <p>约：{{ currentMmLabel }}</p>
      </div>
      <div class="rounded border border-slate-200 bg-slate-50 p-2">
        <p class="font-semibold text-slate-700">尺寸模式</p>
        <div class="mt-1 flex items-center gap-3">
          <label class="flex items-center gap-1">
            <input v-model="sizeMode" type="radio" value="preset" >
            预设
          </label>
          <label class="flex items-center gap-1">
            <input v-model="sizeMode" type="radio" value="custom" >
            自定义
          </label>
        </div>
        <div v-if="sizeMode === 'preset'" class="mt-2">
          <select v-model="presetId" class="w-full rounded border border-slate-300 bg-white px-2 py-1">
            <option v-for="preset in sizePresets" :key="preset.id" :value="preset.id">
              {{ preset.label }}（{{ preset.widthMm }} x {{ preset.heightMm }} mm）
            </option>
          </select>
        </div>
        <div v-else class="mt-2 space-y-2">
          <label class="flex items-center justify-between gap-2">
            宽(mm)
            <input v-model.number="customWidthMm" type="number" min="80" class="w-24 rounded border border-slate-300 px-2 py-1" >
          </label>
          <label class="flex items-center justify-between gap-2">
            高(mm)
            <input v-model.number="customHeightMm" type="number" min="80" class="w-24 rounded border border-slate-300 px-2 py-1" >
          </label>
          <button
            type="button"
            class="w-full rounded border border-teal-700 bg-white px-2 py-1 font-semibold text-teal-800"
            @click="applyCustomSize"
          >
            应用自定义尺寸
          </button>
        </div>
      </div>
      <div class="rounded border border-slate-200 bg-slate-50 p-2">
        导出格式：PDF（画布尺寸与导出页尺寸保持一致）
      </div>
      <div class="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
        <p class="font-semibold text-slate-700">快速教程（3步）</p>
        <p class="mt-1">1) 左侧单击缩略图选页（Ctrl/Cmd 多选、Shift 连选），再点“加入画布”或直接拖入。</p>
        <p class="mt-1">2) 选中对象后可调宽高；勾选“等比锁定”可按比例缩放；支持左旋/右旋按钮。</p>
        <p class="mt-1">3) 多页输出先设“导出页”并分配，再点顶部“预览导出”确认后下载。</p>
        <p class="mt-1">仅画布对象参与导出；画布空白区域会按页面空白导出。</p>
      </div>
    </div>
  </aside>
</template>
