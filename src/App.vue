<script setup lang="ts">
import { computed, ref } from 'vue'
import appHeader from '@/components/layout/app_header.vue'
import sidePanel from '@/components/layout/side_panel.vue'
import mainCanvas from '@/components/canvas/main_canvas.vue'
import propertyPanel from '@/components/layout/property_panel.vue'
import { exportComposedPdf } from '@/composables/use_pdf_export'
import { useDocumentStore } from '@/stores/document_store'
import type { CanvasExportItem } from '@/types'

type MainCanvasExpose = {
  getExportSnapshot: () => {
    canvasWidthPx: number
    canvasHeightPx: number
    items: CanvasExportItem[]
  }
  addPagesToCanvas: (pageIds: string[]) => Promise<void>
}

const PDF_HEADER = '%PDF-'

const hasPdfHeader = (bytes: Uint8Array) => {
  if (!bytes.length) {
    return false
  }

  const maxScan = Math.min(bytes.length, 1024)
  const headerBytes = [...PDF_HEADER].map((ch) => ch.charCodeAt(0))
  for (let i = 0; i <= maxScan - headerBytes.length; i += 1) {
    let matched = true
    for (let j = 0; j < headerBytes.length; j += 1) {
      if (bytes[i + j] !== headerBytes[j]) {
        matched = false
        break
      }
    }

    if (matched) {
      return true
    }
  }

  return false
}

const documentStore = useDocumentStore()
const lastSelectedPageId = ref('')
const exportPending = ref(false)
const mainCanvasRef = ref<MainCanvasExpose | null>(null)
const pageWidthPt = ref(841.89)
const pageHeightPt = ref(595.28)

const pageCount = computed(() => documentStore.allPages.length)
const selectedCount = computed(() => documentStore.selectedPageIds.length)
const sourceCount = computed(() => documentStore.uploadedPdfs.length)

const onUploadFiles = async (files: File[]) => {
  await documentStore.loadPdfFiles(files)
  lastSelectedPageId.value = ''
}

const onSelectPage = (payload: { pageId: string; append: boolean; range: boolean }) => {
  if (payload.range && lastSelectedPageId.value) {
    documentStore.selectRange(lastSelectedPageId.value, payload.pageId)
    return
  }

  if (payload.append) {
    documentStore.togglePage(payload.pageId)
  } else {
    documentStore.selectSinglePage(payload.pageId)
  }

  lastSelectedPageId.value = payload.pageId
}

const onUploadSvgFiles = async (files: File[]) => {
  await documentStore.loadSvgFiles(files)
}

const onSelectAllPages = () => {
  documentStore.selectAllPages()
}

const onClearSelection = () => {
  documentStore.resetSelection()
}

const onUpdatePageSize = (payload: { widthPt: number; heightPt: number; label: string }) => {
  pageWidthPt.value = payload.widthPt
  pageHeightPt.value = payload.heightPt
}

const onAddSelectedPagesToCanvas = async () => {
  if (!mainCanvasRef.value || !documentStore.selectedPageIds.length) {
    window.alert('请先在左侧选择页面后再加入画布')
    return
  }

  await mainCanvasRef.value.addPagesToCanvas(documentStore.selectedPageIds)
}

const buildExportResult = async () => {
  if (!mainCanvasRef.value) {
    throw new Error('画布未就绪')
  }

  const snapshot = mainCanvasRef.value.getExportSnapshot()
  if (!snapshot.items.length) {
    throw new Error('画布为空，无法导出')
  }

  const hasInvalidItem = snapshot.items.some((item) => {
    if (item.kind === 'pdf') {
      return !item.meta || !documentStore.uploadedPdfs.some((pdf) => pdf.id === item.meta?.sourcePdfId)
    }

    if (item.kind === 'svg') {
      return !item.svgDataUrl
    }

    return true
  })

  if (hasInvalidItem) {
    throw new Error('存在无法导出的对象，请重新拖拽该对象后再导出')
  }

  const usedPdfIds = new Set(
    snapshot.items
      .filter((item) => item.kind === 'pdf' && item.meta)
      .map((item) => item.meta?.sourcePdfId ?? ''),
  )
  const headerInvalidNames = documentStore.uploadedPdfs
    .filter((pdf) => usedPdfIds.has(pdf.id) && !hasPdfHeader(pdf.sourceBytes))
    .map((pdf) => pdf.name)

  if (headerInvalidNames.length) {
    throw new Error(`以下源PDF头信息无效：${headerInvalidNames.join('、')}。请重新上传后重加页面。`)
  }

  return exportComposedPdf({
    sourceBytesByPdfId: Object.fromEntries(
      documentStore.uploadedPdfs.map((pdf) => [pdf.id, pdf.sourceBytes]),
    ),
    sourceNameByPdfId: Object.fromEntries(
      documentStore.uploadedPdfs.map((pdf) => [pdf.id, pdf.name]),
    ),
    canvasWidthPx: snapshot.canvasWidthPx,
    canvasHeightPx: snapshot.canvasHeightPx,
    pageWidthPt: pageWidthPt.value,
    pageHeightPt: pageHeightPt.value,
    items: snapshot.items,
  })
}

const openPdfPreview = (bytes: Uint8Array) => {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(arrayBuffer).set(bytes)
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 60_000)
}

const downloadPdf = (bytes: Uint8Array) => {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(arrayBuffer).set(bytes)
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${documentStore.activePdf?.name.replace(/\.pdf$/i, '') ?? 'compose'}_compose.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
}

const onPreviewPdf = async () => {
  if (exportPending.value) {
    return
  }

  if (!documentStore.activePdf || !mainCanvasRef.value) {
    window.alert('请先上传 PDF')
    return
  }

  exportPending.value = true
  try {
    const exported = await buildExportResult()
    openPdfPreview(exported.bytes)
    const qualityHint = exported.report.svgRasterObjects > 0
      ? `注意：有 ${exported.report.svgRasterObjects} 个 SVG 使用位图降级，无法做到完全无损。`
      : '当前对象均可按矢量链路导出。'
    window.alert(`预览已打开：该预览与导出链路一致，可先确认版式再下载。\n${qualityHint}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '请检查对象状态后重试'
    if (message.includes('No PDF header found')) {
      window.alert(
        '导出预览失败：检测到源PDF头信息异常。\n请删除画布中相关对象，重新上传源PDF，再将页面重新加入画布后重试。',
      )
      return
    }

    window.alert(`导出预览失败：${message}`)
  } finally {
    exportPending.value = false
  }
}

const onExportPdf = async () => {
  if (exportPending.value) {
    return
  }

  if (!documentStore.activePdf || !mainCanvasRef.value) {
    window.alert('请先上传 PDF')
    return
  }

  exportPending.value = true

  try {
    const exported = await buildExportResult()
    downloadPdf(exported.bytes)
    const qualityHint = exported.report.svgRasterObjects > 0
      ? `（提示：有 ${exported.report.svgRasterObjects} 个 SVG 因复杂效果降级为位图，非完全无损）`
      : '（当前导出对象均走矢量链路）'
    window.alert(
      `导出完成。PDF对象 ${exported.report.pdfObjects} 个，SVG矢量 ${exported.report.svgVectorObjects} 个，SVG位图降级 ${exported.report.svgRasterObjects} 个，无效对象 ${exported.report.invalidObjects} 个。${qualityHint}`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '请检查对象状态后重试'
    if (message.includes('No PDF header found')) {
      window.alert(
        '导出失败：检测到源PDF头信息异常。\n请删除画布中相关对象，重新上传源PDF，再将页面重新加入画布后导出。',
      )
      return
    }

    window.alert(`导出失败：${message}`)
  } finally {
    exportPending.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <app-header
      :file-name="documentStore.activePdf?.name ?? ''"
      :source-count="sourceCount"
      :page-count="pageCount"
      :selected-count="selectedCount"
      :export-pending="exportPending"
      @preview-pdf="onPreviewPdf"
      @export-pdf="onExportPdf"
    />

    <section class="flex min-h-0 flex-1">
      <side-panel
        :pages="documentStore.allPages"
        :svg-assets="documentStore.svgAssets"
        :selected-page-ids="documentStore.selectedPageIds"
        :loading="documentStore.loading"
        :error-message="documentStore.errorMessage"
        @upload-files="onUploadFiles"
        @upload-svg-files="onUploadSvgFiles"
        @add-selected="onAddSelectedPagesToCanvas"
        @select-all-pages="onSelectAllPages"
        @clear-selection="onClearSelection"
        @select-page="onSelectPage"
      />

      <main-canvas
        ref="mainCanvasRef"
        :pages="documentStore.allPages"
        :svg-assets="documentStore.svgAssets"
        :selected-pages="documentStore.selectedPages"
        :page-width-pt="pageWidthPt"
        :page-height-pt="pageHeightPt"
      />
      <property-panel
        :selected-count="selectedCount"
        :page-width-pt="pageWidthPt"
        :page-height-pt="pageHeightPt"
        @update-page-size="onUpdatePageSize"
      />
    </section>
  </div>
</template>
