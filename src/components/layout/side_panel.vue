<script setup lang="ts">
import fileUpload from '@/components/common/file_upload.vue'
import pageThumbnail from '@/components/common/page_thumbnail.vue'
import type { PdfPagePreview, SvgAsset } from '@/types'

defineProps<{
  pages: PdfPagePreview[]
  svgAssets: SvgAsset[]
  selectedPageIds: string[]
  loading: boolean
  errorMessage: string
}>()

const emit = defineEmits<{
  uploadFiles: [files: File[]]
  uploadSvgFiles: [files: File[]]
  addSelected: []
  selectAllPages: []
  clearSelection: []
  selectPage: [payload: { pageId: string; append: boolean; range: boolean }]
}>()

const onSvgUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files ? [...target.files] : []
  if (!files.length) {
    return
  }

  emit('uploadSvgFiles', files)
  target.value = ''
}

const onSvgDragStart = (event: DragEvent, assetId: string) => {
  if (!event.dataTransfer) {
    return
  }

  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-svg-asset-id', assetId)
}
</script>

<template>
  <aside class="flex h-full w-[280px] flex-col border-r border-slate-200 bg-white/80 p-3">
    <file-upload @upload-files="emit('uploadFiles', $event)" />

    <label class="mt-3 block rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-3 text-xs text-slate-600">
      <span class="font-semibold text-slate-700">导入 SVG 资产</span>
      <input type="file" accept=".svg,image/svg+xml" multiple class="mt-2 block w-full text-xs" @change="onSvgUpload">
    </label>

    <div v-if="errorMessage" class="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
      {{ errorMessage }}
    </div>

    <div class="mt-3 min-h-0 flex-1 overflow-auto">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">页面缩略图</h2>
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-500">{{ pages.length }} 页</span>
          <button
            type="button"
            class="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            @click="emit('selectAllPages')"
          >
            全选
          </button>
          <button
            type="button"
            class="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            @click="emit('clearSelection')"
          >
            清空
          </button>
          <button
            type="button"
            class="rounded border border-teal-700 bg-white px-2 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-50"
            @click="emit('addSelected')"
          >
            加入画布
          </button>
        </div>
      </div>

      <div v-if="loading" class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        正在解析并渲染缩略图...
      </div>

      <div v-else-if="!pages.length" class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        上传 PDF 后将在这里显示页面缩略图。
      </div>

      <p v-if="!loading && pages.length" class="mb-2 text-[11px] text-slate-500">
        缩略图仅用于选择，拖入画布后会使用更高分辨率预览。
      </p>

      <div v-if="!loading && pages.length" class="space-y-2 pb-4">
        <page-thumbnail
          v-for="page in pages"
          :key="page.id"
          :page="page"
          :selected="selectedPageIds.includes(page.id)"
          @select="emit('selectPage', $event)"
        />
      </div>

      <div class="mt-4">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">SVG 资产</h2>
        <div v-if="!svgAssets.length" class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          暂无 SVG，导入后可拖拽到画布。
        </div>
        <div v-else class="space-y-2">
          <button
            v-for="asset in svgAssets"
            :key="asset.id"
            type="button"
            draggable="true"
            class="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 hover:border-slate-300"
            @dragstart="onSvgDragStart($event, asset.id)"
          >
            <span class="truncate">{{ asset.name }}</span>
            <span class="rounded bg-slate-100 px-1 py-0.5 text-[10px]">SVG</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
