import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { buildUploadedPdf } from '@/composables/use_pdf_renderer'
import type { SvgAsset, UploadedPdf } from '@/types'

export const useDocumentStore = defineStore('document', () => {
  const uploadedPdfs = ref<UploadedPdf[]>([])
  const selectedPageIds = ref<string[]>([])
  const svgAssets = ref<SvgAsset[]>([])
  const loading = ref(false)
  const errorMessage = ref('')
  const MAX_SVG_SIZE = 8 * 1024 * 1024

  const activePdf = computed(() => {
    if (!uploadedPdfs.value.length) {
      return null
    }

    return uploadedPdfs.value[uploadedPdfs.value.length - 1] ?? null
  })
  const hasDocument = computed(() => uploadedPdfs.value.length > 0)
  const allPages = computed(() => uploadedPdfs.value.flatMap((pdf) => pdf.pages))

  const selectedPages = computed(() => {
    if (!allPages.value.length) {
      return []
    }

    return allPages.value.filter((page) => selectedPageIds.value.includes(page.id))
  })

  const resetSelection = () => {
    selectedPageIds.value = []
  }

  const selectSinglePage = (pageId: string) => {
    selectedPageIds.value = [pageId]
  }

  const togglePage = (pageId: string) => {
    if (selectedPageIds.value.includes(pageId)) {
      selectedPageIds.value = selectedPageIds.value.filter((id) => id !== pageId)
      return
    }

    selectedPageIds.value = [...selectedPageIds.value, pageId]
  }

  const selectRange = (startPageId: string, endPageId: string) => {
    if (!allPages.value.length) {
      return
    }

    const ids = allPages.value.map((page) => page.id)
    const startIndex = ids.indexOf(startPageId)
    const endIndex = ids.indexOf(endPageId)

    if (startIndex < 0 || endIndex < 0) {
      return
    }

    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
    selectedPageIds.value = ids.slice(from, to + 1)
  }

  const selectAllPages = () => {
    selectedPageIds.value = allPages.value.map((page) => page.id)
  }

  const loadPdfFile = async (file: File) => {
    loading.value = true
    errorMessage.value = ''

    try {
      const nextPdf = await buildUploadedPdf(file)
      uploadedPdfs.value = [...uploadedPdfs.value, nextPdf]
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'PDF 解析失败'
    } finally {
      loading.value = false
    }
  }

  const loadPdfFiles = async (files: File[]) => {
    if (!files.length) {
      return
    }

    loading.value = true
    errorMessage.value = ''

    const nextPdfs: UploadedPdf[] = []
    const failedFiles: string[] = []

    for (const file of files) {
      try {
        const nextPdf = await buildUploadedPdf(file)
        nextPdfs.push(nextPdf)
      } catch {
        failedFiles.push(file.name)
      }
    }

    uploadedPdfs.value = [...uploadedPdfs.value, ...nextPdfs]

    if (failedFiles.length) {
      errorMessage.value = `以下文件解析失败：${failedFiles.join('、')}`
    }

    loading.value = false
  }

  const loadSvgFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') {
      errorMessage.value = '仅支持 SVG 文件'
      return
    }

    if (file.size > MAX_SVG_SIZE) {
      errorMessage.value = 'SVG 文件过大，请控制在 8MB 以内'
      return
    }

    errorMessage.value = ''

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('SVG 读取失败'))
      reader.readAsDataURL(file)
    })

    try {
      svgAssets.value = [
        ...svgAssets.value,
        {
          id: `${file.name}-${file.lastModified}-${svgAssets.value.length}`,
          name: file.name,
          dataUrl,
        },
      ]
    } catch {
      errorMessage.value = 'SVG 导入失败'
    }
  }

  const loadSvgFiles = async (files: File[]) => {
    for (const file of files) {
      await loadSvgFile(file)
    }
  }

  return {
    activePdf,
    uploadedPdfs,
    allPages,
    selectedPageIds,
    selectedPages,
    svgAssets,
    loading,
    errorMessage,
    hasDocument,
    loadPdfFile,
    loadPdfFiles,
    loadSvgFile,
    loadSvgFiles,
    selectSinglePage,
    togglePage,
    selectRange,
    selectAllPages,
    resetSelection,
  }
})
