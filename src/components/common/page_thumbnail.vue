<script setup lang="ts">
import type { PdfPagePreview } from '@/types'

defineProps<{
  page: PdfPagePreview
  selected: boolean
}>()

const emit = defineEmits<{
  select: [payload: { pageId: string; append: boolean; range: boolean }]
}>()

const onClick = (event: MouseEvent, pageId: string) => {
  emit('select', {
    pageId,
    append: event.metaKey || event.ctrlKey,
    range: event.shiftKey,
  })
}

const onDragStart = (event: DragEvent, pageId: string) => {
  if (!event.dataTransfer) {
    return
  }

  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-pdf-page-id', pageId)
}
</script>

<template>
  <button
    type="button"
    draggable="true"
    class="group w-full rounded-lg border p-2 text-left transition"
    :class="selected ? 'border-teal-700 bg-teal-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'"
    @click="onClick($event, page.id)"
    @dragstart="onDragStart($event, page.id)"
  >
    <img
      :src="page.thumbnailDataUrl"
      :alt="`Page ${page.pageNumber}`"
      class="mx-auto h-auto w-full rounded border border-slate-200"
    >
    <div class="mt-2 flex items-center justify-between text-xs text-slate-600">
      <span>第 {{ page.pageNumber }} 页</span>
      <span>{{ Math.round(page.widthPt) }} x {{ Math.round(page.heightPt) }} pt</span>
    </div>
  </button>
</template>
