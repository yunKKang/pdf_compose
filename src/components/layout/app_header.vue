<script setup lang="ts">
defineProps<{
  fileName: string
  pageCount: number
  selectedCount: number
  sourceCount: number
  exportPending: boolean
}>()

const emit = defineEmits<{
  previewPdf: []
  exportPdf: []
}>()
</script>

<template>
  <header class="flex h-14 items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur-sm">
    <div>
      <h1 class="text-base font-semibold text-slate-800">PDF Compose</h1>
      <p class="text-xs text-slate-500">论文图表拼版工具</p>
      <p class="text-[11px] text-slate-400">SVG 导出：矢量优先，复杂效果自动位图降级</p>
    </div>
    <div class="flex items-center gap-4 text-xs text-slate-600">
      <span class="rounded bg-slate-100 px-2 py-1">{{ fileName || '未加载文件' }}</span>
      <span>来源：{{ sourceCount }}</span>
      <span>页数：{{ pageCount }}</span>
      <span>已选：{{ selectedCount }}</span>
      <button
        type="button"
        :disabled="exportPending"
        class="rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
        @click="emit('previewPdf')"
      >
        预览导出
      </button>
      <button
        type="button"
        :disabled="exportPending"
        class="rounded border border-teal-700 bg-white px-3 py-1.5 font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
        @click="emit('exportPdf')"
      >
        {{ exportPending ? '导出中...' : '导出 PDF' }}
      </button>
    </div>
  </header>
</template>
