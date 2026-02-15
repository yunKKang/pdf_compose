import { loadPdfDocument } from '@/libs/pdfjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PdfPagePreview, UploadedPdf } from '@/types'

const THUMBNAIL_WIDTH = 210
const CANVAS_PREVIEW_WIDTH = 1800

const toUint8Array = async (file: File): Promise<Uint8Array> => {
  const buffer = await file.arrayBuffer()
  return new Uint8Array(buffer)
}

const renderPageToDataUrl = async (documentProxy: PDFDocumentProxy, pageNumber: number, targetWidth: number) => {
  const page = await documentProxy.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = targetWidth / baseViewport.width
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('缩略图渲染失败：无法创建 Canvas 上下文')
  }

  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise

  const thumbnailDataUrl = canvas.toDataURL('image/png')

  return {
    dataUrl: thumbnailDataUrl,
    widthPt: baseViewport.width,
    heightPt: baseViewport.height,
  }
}

const renderPageThumbnail = async (
  documentProxy: PDFDocumentProxy,
  pageNumber: number,
  sourcePdfId: string,
  sourcePdfName: string,
): Promise<PdfPagePreview> => {
  const thumbnail = await renderPageToDataUrl(documentProxy, pageNumber, THUMBNAIL_WIDTH)
  const canvasPreview = await renderPageToDataUrl(documentProxy, pageNumber, CANVAS_PREVIEW_WIDTH)

  return {
    id: `${sourcePdfId}-${pageNumber}`,
    sourcePdfId,
    sourcePdfName,
    pageNumber,
    widthPt: thumbnail.widthPt,
    heightPt: thumbnail.heightPt,
    thumbnailDataUrl: thumbnail.dataUrl,
    canvasPreviewDataUrl: canvasPreview.dataUrl,
  }
}

export const buildUploadedPdf = async (file: File): Promise<UploadedPdf> => {
  const sourceBytes = await toUint8Array(file)
  const renderBytes = sourceBytes.slice()
  const documentProxy = await loadPdfDocument(renderBytes)
  const sourcePdfId = `${file.name}-${file.lastModified}`
  const pages: PdfPagePreview[] = []

  for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
    const pagePreview = await renderPageThumbnail(documentProxy, pageNumber, sourcePdfId, file.name)
    pages.push(pagePreview)
  }

  return {
    id: sourcePdfId,
    name: file.name,
    size: file.size,
    sourceBytes,
    pages,
  }
}
