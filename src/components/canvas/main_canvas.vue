<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useFabricCanvas } from '@/composables/use_fabric_canvas'
import type { CanvasExportItem, PdfPagePreview, SvgAsset } from '@/types'

const props = defineProps<{
  pages: PdfPagePreview[]
  svgAssets: SvgAsset[]
  selectedPages: PdfPagePreview[]
  pageWidthPt: number
  pageHeightPt: number
}>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const canvasWrapperEl = ref<HTMLDivElement | null>(null)
const fabricCanvas = useFabricCanvas()

const selectedLabel = computed(() => {
  if (!props.selectedPages.length) {
    return '未选中页面'
  }

  return `已选 ${props.selectedPages.length} 页`
})

const canvasSizeLabel = computed(() => `${Math.round(props.pageWidthPt)} x ${Math.round(props.pageHeightPt)} pt`)

const cropLeft = ref(0)
const cropTop = ref(0)
const cropRight = ref(0)
const cropBottom = ref(0)
const gridVisible = ref(true)
const snapEnabled = ref(true)
const outputPageNo = ref(1)
const nextPlacementOffset = ref(0)
const objectWidthPx = ref(0)
const objectHeightPx = ref(0)
const sizeLockRatio = ref(false)
const lastSizeInputAxis = ref<'width' | 'height'>('width')
let offSelectionChange: (() => void) | null = null

const clampCrop = (value: number) => Math.max(0, Math.min(45, value))

const applyCrop = () => {
  fabricCanvas.applyCropToActive({
    leftPct: clampCrop(cropLeft.value) / 100,
    topPct: clampCrop(cropTop.value) / 100,
    rightPct: clampCrop(cropRight.value) / 100,
    bottomPct: clampCrop(cropBottom.value) / 100,
  })
}

const resetCrop = () => {
  cropLeft.value = 0
  cropTop.value = 0
  cropRight.value = 0
  cropBottom.value = 0
  fabricCanvas.resetCropOnActive()
}

const startCropFrame = () => {
  fabricCanvas.startCropFrame()
}

const applyCropFrame = () => {
  fabricCanvas.applyCropFromFrame()
}

const cancelCropFrame = () => {
  fabricCanvas.cancelCropFrame()
}

const undo = async () => {
  await fabricCanvas.undo()
}

const redo = async () => {
  await fabricCanvas.redo()
}

const alignLeft = () => {
  fabricCanvas.alignLeft()
}

const alignTop = () => {
  fabricCanvas.alignTop()
}

const alignCenter = () => {
  fabricCanvas.alignCenter()
}

const layerForward = () => {
  fabricCanvas.layerForward()
}

const layerBackward = () => {
  fabricCanvas.layerBackward()
}

const layerToFront = () => {
  fabricCanvas.layerToFront()
}

const layerToBack = () => {
  fabricCanvas.layerToBack()
}

const toggleGridVisible = () => {
  gridVisible.value = !gridVisible.value
}

const toggleSnap = () => {
  snapEnabled.value = !snapEnabled.value
  fabricCanvas.setGridSnapEnabled(snapEnabled.value)
}

const assignSelectionToPage = () => {
  const rawPage = Number.isFinite(outputPageNo.value) ? outputPageNo.value : 1
  const pageNo = Math.max(1, Math.floor(rawPage))
  outputPageNo.value = pageNo
  fabricCanvas.assignSelectionToPage(pageNo)
  window.alert(`已分配到导出第 ${pageNo} 页`)
}

const applyObjectSize = () => {
  let widthPx = Math.max(8, Number.isFinite(objectWidthPx.value) ? objectWidthPx.value : 0)
  let heightPx = Math.max(8, Number.isFinite(objectHeightPx.value) ? objectHeightPx.value : 0)
  if (!widthPx || !heightPx) {
    return
  }

  if (sizeLockRatio.value) {
    const current = fabricCanvas.getActiveObjectSize()
    if (current && current.widthPx > 0 && current.heightPx > 0) {
      if (lastSizeInputAxis.value === 'width') {
        heightPx = Math.max(8, Math.round((widthPx * current.heightPx / current.widthPx) * 100) / 100)
      } else {
        widthPx = Math.max(8, Math.round((heightPx * current.widthPx / current.heightPx) * 100) / 100)
      }
      objectWidthPx.value = widthPx
      objectHeightPx.value = heightPx
    }
  }

  fabricCanvas.setActiveObjectSize(widthPx, heightPx)
}

const onWidthInput = () => {
  lastSizeInputAxis.value = 'width'
}

const onHeightInput = () => {
  lastSizeInputAxis.value = 'height'
}

const rotateLeft = () => {
  fabricCanvas.rotateSelection(-90)
}

const rotateRight = () => {
  fabricCanvas.rotateSelection(90)
}

const addPageToCanvas = async (page: PdfPagePreview, dropLeft?: number, dropTop?: number) => {
  if (!canvasWrapperEl.value) {
    return
  }

  const canvasSize = fabricCanvas.getCanvasSize()
  const targetWidth = 280
  const targetHeight = (targetWidth * page.heightPt) / page.widthPt
  const centerLeft = (canvasSize.widthPx - targetWidth) / 2
  const centerTop = (canvasSize.heightPx - targetHeight) / 2
  const offsetLeft = (nextPlacementOffset.value % 6) * 18
  const offsetTop = (nextPlacementOffset.value % 6) * 14
  const baseLeft = dropLeft ?? Math.max(12, centerLeft + offsetLeft)
  const baseTop = dropTop ?? Math.max(12, centerTop + offsetTop)

  await fabricCanvas.addPdfItem({
    thumbnailDataUrl: page.canvasPreviewDataUrl,
    left: baseLeft,
    top: baseTop,
    meta: {
      pageId: page.id,
      sourcePdfId: page.sourcePdfId,
      pageNumber: page.pageNumber,
      widthPt: page.widthPt,
      heightPt: page.heightPt,
      outputPage: 1,
    },
  })

  nextPlacementOffset.value += 1
}

const addPagesToCanvas = async (pageIds: string[]) => {
  for (const pageId of pageIds) {
    const page = props.pages.find((item) => item.id === pageId)
    if (!page) {
      continue
    }

    await addPageToCanvas(page)
  }
}

const onDrop = async (event: DragEvent) => {
  event.preventDefault()
  const droppedId = event.dataTransfer?.getData('application/x-pdf-page-id')
  const droppedSvgId = event.dataTransfer?.getData('application/x-svg-asset-id')

  if (droppedSvgId && canvasWrapperEl.value) {
    const asset = props.svgAssets.find((item) => item.id === droppedSvgId)
    if (!asset) {
      return
    }

    const rect = canvasWrapperEl.value.getBoundingClientRect()
    const left = event.clientX - rect.left
    const top = event.clientY - rect.top

    await fabricCanvas.addSvgItem({
      dataUrl: asset.dataUrl,
      left,
      top,
    })
    return
  }

  if (!droppedId || !canvasWrapperEl.value) {
    return
  }

  const page = props.pages.find((item) => item.id === droppedId)
  if (!page) {
    return
  }

  const rect = canvasWrapperEl.value.getBoundingClientRect()
  const left = event.clientX - rect.left
  const top = event.clientY - rect.top

  await addPageToCanvas(page, left, top)
}

const onKeyDown = (event: KeyboardEvent) => {
  if (event.ctrlKey && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    void undo()
  }

  if (event.ctrlKey && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    void redo()
  }

  if (event.key.toLowerCase() === 'g') {
    event.preventDefault()
    toggleGridVisible()
  }

  if (event.key.toLowerCase() === 's' && event.ctrlKey) {
    event.preventDefault()
    toggleSnap()
  }

  if (event.key === ']') {
    event.preventDefault()
    layerForward()
  }

  if (event.key === '[') {
    event.preventDefault()
    layerBackward()
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    fabricCanvas.removeSelected()
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    fabricCanvas.nudgeSelection(0, event.shiftKey ? -10 : -1)
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    fabricCanvas.nudgeSelection(0, event.shiftKey ? 10 : 1)
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    fabricCanvas.nudgeSelection(event.shiftKey ? -10 : -1, 0)
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    fabricCanvas.nudgeSelection(event.shiftKey ? 10 : 1, 0)
  }

  if (event.key.toLowerCase() === 'r' && event.ctrlKey) {
    event.preventDefault()
    fabricCanvas.resetView()
  }
}

onMounted(() => {
  if (!canvasEl.value) {
    return
  }

  fabricCanvas.init(canvasEl.value)
  fabricCanvas.setCanvasSize(props.pageWidthPt, props.pageHeightPt)
  fabricCanvas.setGridSnapEnabled(snapEnabled.value)
  offSelectionChange = fabricCanvas.onSelectionChange((size) => {
    if (!size) {
      objectWidthPx.value = 0
      objectHeightPx.value = 0
      return
    }

    objectWidthPx.value = size.widthPx
    objectHeightPx.value = size.heightPx
  })
  window.addEventListener('keydown', onKeyDown)
})

watch(
  () => ({ widthPt: props.pageWidthPt, heightPt: props.pageHeightPt }),
  ({ widthPt, heightPt }) => {
    fabricCanvas.setCanvasSize(widthPt, heightPt)
  },
)

onBeforeUnmount(() => {
  offSelectionChange?.()
  offSelectionChange = null
  window.removeEventListener('keydown', onKeyDown)
  fabricCanvas.dispose()
})

const getExportSnapshot = () => {
  const canvasSize = fabricCanvas.getCanvasSize()
  const items: CanvasExportItem[] = fabricCanvas.getExportItems()

  return {
    canvasWidthPx: canvasSize.widthPx,
    canvasHeightPx: canvasSize.heightPx,
    items,
  }
}

defineExpose({
  getExportSnapshot,
  addPagesToCanvas,
})
</script>

<template>
  <main class="flex min-h-0 flex-1 items-center justify-center bg-slate-100/80 p-6">
    <div class="flex h-full w-full max-w-[960px] flex-col rounded-2xl border border-slate-300 bg-white shadow-sm">
      <div class="border-b border-slate-200 px-4 py-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-slate-700">画布区（Fabric.js 已接入）</h2>
          <span class="text-xs text-slate-500">{{ selectedLabel }} · 画布 {{ canvasSizeLabel }}</span>
        </div>
        <p class="text-xs text-slate-500">从左侧缩略图拖拽页面到画布，Ctrl+滚轮缩放，Delete 删除对象。</p>
        <div class="mt-2 space-y-2 text-xs text-slate-600">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium text-slate-700">编辑</span>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="undo">撤销</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="redo">重做</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="layerForward">上移一层</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="layerBackward">下移一层</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="layerToFront">置顶</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="layerToBack">置底</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="rotateLeft">左旋 90°</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="rotateRight">右旋 90°</button>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium text-slate-700">对齐与网格</span>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="alignLeft">左对齐</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="alignTop">顶对齐</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="alignCenter">水平居中</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="toggleGridVisible">{{ gridVisible ? '隐藏网格' : '显示网格' }}</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="toggleSnap">{{ snapEnabled ? '关闭吸附' : '开启吸附' }}</button>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium text-slate-700">尺寸</span>
            <label class="flex items-center gap-1">W(px)
              <input v-model.number="objectWidthPx" type="number" min="8" class="w-20 rounded border border-slate-300 px-1 py-0.5" @input="onWidthInput" >
            </label>
            <label class="flex items-center gap-1">H(px)
              <input v-model.number="objectHeightPx" type="number" min="8" class="w-20 rounded border border-slate-300 px-1 py-0.5" @input="onHeightInput" >
            </label>
            <label class="flex items-center gap-1 text-slate-700">
              <input v-model="sizeLockRatio" type="checkbox" >
              等比锁定
            </label>
            <button type="button" class="rounded border border-teal-700 bg-white px-2 py-1 font-semibold text-teal-800" @click="applyObjectSize">应用尺寸</button>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium text-slate-700">裁剪</span>
            <label class="flex items-center gap-1">L <input v-model.number="cropLeft" type="number" min="0" max="45" class="w-14 rounded border border-slate-300 px-1 py-0.5" ></label>
            <label class="flex items-center gap-1">T <input v-model.number="cropTop" type="number" min="0" max="45" class="w-14 rounded border border-slate-300 px-1 py-0.5" ></label>
            <label class="flex items-center gap-1">R <input v-model.number="cropRight" type="number" min="0" max="45" class="w-14 rounded border border-slate-300 px-1 py-0.5" ></label>
            <label class="flex items-center gap-1">B <input v-model.number="cropBottom" type="number" min="0" max="45" class="w-14 rounded border border-slate-300 px-1 py-0.5" ></label>
            <button type="button" class="rounded border border-teal-700 bg-white px-2 py-1 font-semibold text-teal-800" @click="applyCrop">应用裁剪</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="resetCrop">重置裁剪</button>
            <button type="button" class="rounded border border-sky-700 bg-white px-2 py-1 font-semibold text-sky-800" @click="startCropFrame">开始裁剪框</button>
            <button type="button" class="rounded border border-sky-700 bg-white px-2 py-1 font-semibold text-sky-800" @click="applyCropFrame">应用裁剪框</button>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="cancelCropFrame">取消裁剪框</button>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium text-slate-700">导出页分配</span>
            <label class="flex items-center gap-1 text-slate-700">导出页
              <input v-model.number="outputPageNo" type="number" min="1" class="w-14 rounded border border-slate-300 px-1 py-0.5" >
            </label>
            <button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700" @click="assignSelectionToPage">分配到页</button>
          </div>
        </div>
      </div>

      <div ref="canvasWrapperEl" class="min-h-0 flex-1 overflow-auto p-4" @dragover.prevent @drop="onDrop">
        <div
          class="relative rounded-xl border border-dashed border-slate-300 p-3"
          :style="{
            backgroundColor: '#f8fafc',
          }"
        >
          <div class="relative mx-auto inline-block">
            <canvas ref="canvasEl" class="mx-auto rounded border border-slate-300 shadow-sm" />
            <div
              v-if="gridVisible"
              class="pointer-events-none absolute inset-0 rounded"
              :style="{
                backgroundImage:
                  'linear-gradient(to right, rgba(148,163,184,0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.3) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }"
            />
          </div>
        </div>

        <div v-if="!selectedPages.length" class="mt-3 grid place-items-center rounded-xl border border-dashed border-slate-300 bg-white p-4">
          <p class="px-4 text-center text-sm text-slate-500">
            先在左侧选择并拖拽页面到画布。多选支持 Ctrl/Cmd 与 Shift。
          </p>
        </div>
      </div>
    </div>
  </main>
</template>
