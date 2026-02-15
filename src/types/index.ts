export type PdfPagePreview = {
  id: string
  sourcePdfId: string
  sourcePdfName: string
  pageNumber: number
  widthPt: number
  heightPt: number
  thumbnailDataUrl: string
  canvasPreviewDataUrl: string
}

export type UploadedPdf = {
  id: string
  name: string
  size: number
  sourceBytes: Uint8Array
  pages: PdfPagePreview[]
}

export type SvgAsset = {
  id: string
  name: string
  dataUrl: string
}

export type CanvasPdfMeta = {
  pageId: string
  sourcePdfId: string
  pageNumber: number
  widthPt: number
  heightPt: number
  outputPage: number
  cropLeftPct?: number
  cropTopPct?: number
  cropRightPct?: number
  cropBottomPct?: number
}

export type CanvasExportItem = {
  leftPx: number
  topPx: number
  widthPx: number
  heightPx: number
  angleDeg: number
  outputPage: number
  kind: 'pdf' | 'svg'
  meta?: CanvasPdfMeta
  svgDataUrl?: string
}

export type ExportReport = {
  pdfObjects: number
  svgVectorObjects: number
  svgRasterObjects: number
  invalidObjects: number
}
