import { PDFDocument, degrees, rgb, type PDFPage } from 'pdf-lib'
import type { CanvasExportItem, ExportReport } from '@/types'
import { mapCanvasRectToPdf } from '@/utils/coordinate_transform'

type ExportInput = {
  sourceBytesByPdfId: Record<string, Uint8Array>
  sourceNameByPdfId: Record<string, string>
  canvasWidthPx: number
  canvasHeightPx: number
  pageWidthPt: number
  pageHeightPt: number
  items: CanvasExportItem[]
}

const toCropBox = (item: CanvasExportItem) => {
  if (!item.meta) {
    throw new Error('PDF 导出对象缺少页面元数据')
  }

  const leftPct = item.meta.cropLeftPct ?? 0
  const rightPct = item.meta.cropRightPct ?? 0
  const topPct = item.meta.cropTopPct ?? 0
  const bottomPct = item.meta.cropBottomPct ?? 0

  const left = item.meta.widthPt * leftPct
  const right = item.meta.widthPt * (1 - rightPct)
  const bottom = item.meta.heightPt * bottomPct
  const top = item.meta.heightPt * (1 - topPct)

  return {
    left,
    right,
    bottom,
    top,
  }
}

const decodeSvgText = (svgDataUrl: string) => {
  if (!svgDataUrl.startsWith('data:image/svg+xml')) {
    return ''
  }

  const [, body = ''] = svgDataUrl.split(',', 2)
  if (!body) {
    return ''
  }

  if (svgDataUrl.includes(';base64,')) {
    return atob(body)
  }

  return decodeURIComponent(body)
}

const parseHexColor = (colorText: string) => {
  const hex = colorText.trim().replace('#', '')
  if (hex.length !== 6) {
    return undefined
  }

  const r = Number.parseInt(hex.slice(0, 2), 16) / 255
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255
  if ([r, g, b].some((value) => Number.isNaN(value))) {
    return undefined
  }

  return rgb(r, g, b)
}

const SVG_RASTER_SCALE = 6

const toRad = (deg: number) => (deg * Math.PI) / 180

const applyRotationAroundCenter = (
  placement: { xPt: number; yPt: number; widthPt: number; heightPt: number },
  angleDeg: number,
) => {
  const rotateDeg = -angleDeg
  if (!rotateDeg) {
    return {
      xPt: placement.xPt,
      yPt: placement.yPt,
      rotateDeg,
    }
  }

  const theta = toRad(rotateDeg)
  const centerX = placement.xPt + placement.widthPt / 2
  const centerY = placement.yPt + placement.heightPt / 2
  const halfWidth = placement.widthPt / 2
  const halfHeight = placement.heightPt / 2
  const rotatedHalfX = halfWidth * Math.cos(theta) - halfHeight * Math.sin(theta)
  const rotatedHalfY = halfWidth * Math.sin(theta) + halfHeight * Math.cos(theta)

  return {
    xPt: centerX - rotatedHalfX,
    yPt: centerY - rotatedHalfY,
    rotateDeg,
  }
}

const drawSvgAsVector = (
  svgText: string,
  outputPage: PDFPage,
  placement: { xPt: number; yPt: number; widthPt: number; heightPt: number },
  angleDeg: number,
) => {
  if (!svgText) {
    return false
  }

  if (/(<filter|<mask|<pattern|textPath|linearGradient|radialGradient)/i.test(svgText)) {
    return false
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const svg = doc.querySelector('svg')
  const paths = [...doc.querySelectorAll('path[d]')]
  if (!svg || !paths.length) {
    return false
  }

  const viewBoxText = svg.getAttribute('viewBox')
  const viewBoxValues = viewBoxText?.split(/\s+/).map((value) => Number(value)) ?? []
  const viewBoxWidth = viewBoxValues[2]
  const viewBoxHeight = viewBoxValues[3]
  if (!viewBoxWidth || !viewBoxHeight) {
    return false
  }

  const scaleX = placement.widthPt / viewBoxWidth
  const scaleY = placement.heightPt / viewBoxHeight
  const rotation = applyRotationAroundCenter(placement, angleDeg)

  for (const pathElement of paths) {
    const d = pathElement.getAttribute('d')
    if (!d) {
      continue
    }

    const fillText = pathElement.getAttribute('fill') ?? '#111111'
    const strokeText = pathElement.getAttribute('stroke')
    const color = fillText === 'none' ? undefined : parseHexColor(fillText) ?? rgb(0.07, 0.07, 0.07)
    const borderColor = strokeText ? parseHexColor(strokeText) : undefined

    outputPage.drawSvgPath(d, {
      x: rotation.xPt,
      y: rotation.yPt,
      scale: Math.min(scaleX, scaleY),
      color,
      borderColor,
      borderWidth: borderColor ? 0.4 : 0,
      rotate: degrees(rotation.rotateDeg),
    })
  }

  return true
}

const drawSvgAsRaster = async (
  svgDataUrl: string,
  outputPage: PDFPage,
  placement: { xPt: number; yPt: number; widthPt: number; heightPt: number },
  outputDocument: PDFDocument,
  angleDeg: number,
) => {
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('SVG 位图转换失败'))
    image.src = svgDataUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(placement.widthPt * SVG_RASTER_SCALE))
  canvas.height = Math.max(1, Math.round(placement.heightPt * SVG_RASTER_SCALE))
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('SVG 位图转换失败：无法创建 Canvas 上下文')
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const pngBytes = await new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('SVG 位图转换失败：toBlob 为空'))
        return
      }

      const buffer = await blob.arrayBuffer()
      resolve(new Uint8Array(buffer))
    }, 'image/png')
  })

  const embeddedPng = await outputDocument.embedPng(pngBytes)
  const rotation = applyRotationAroundCenter(placement, angleDeg)
  outputPage.drawImage(embeddedPng, {
    x: rotation.xPt,
    y: rotation.yPt,
    width: placement.widthPt,
    height: placement.heightPt,
    rotate: degrees(rotation.rotateDeg),
  })
}

export const exportComposedPdf = async (input: ExportInput) => {
  const sourceDocuments = new Map<string, PDFDocument>()
  const outputDocument = await PDFDocument.create()
  const groupedItems = new Map<number, CanvasExportItem[]>()
  const missingSources = new Set<string>()
  const report: ExportReport = {
    pdfObjects: 0,
    svgVectorObjects: 0,
    svgRasterObjects: 0,
    invalidObjects: 0,
  }

  for (const item of input.items) {
    const outputPage = item.outputPage > 0 ? item.outputPage : 1
    const current = groupedItems.get(outputPage) ?? []
    current.push(item)
    groupedItems.set(outputPage, current)
  }

  const sortedPages = [...groupedItems.keys()].sort((a, b) => a - b)

  for (const pageNo of sortedPages) {
    const outputPage = outputDocument.addPage([input.pageWidthPt, input.pageHeightPt])
    const pageItems = groupedItems.get(pageNo) ?? []

    for (const item of pageItems) {
      const placement = mapCanvasRectToPdf({
        leftPx: item.leftPx,
        topPx: item.topPx,
        widthPx: item.widthPx,
        heightPx: item.heightPx,
        canvasWidthPx: input.canvasWidthPx,
        canvasHeightPx: input.canvasHeightPx,
        pageWidthPt: input.pageWidthPt,
        pageHeightPt: input.pageHeightPt,
      })

      if (item.kind === 'pdf' && item.meta) {
        const sourceBytes = input.sourceBytesByPdfId[item.meta.sourcePdfId]
        if (!sourceBytes) {
          report.invalidObjects += 1
          missingSources.add(item.meta.sourcePdfId)
          continue
        }

        let sourceDocument = sourceDocuments.get(item.meta.sourcePdfId)
        if (!sourceDocument) {
          sourceDocument = await PDFDocument.load(sourceBytes)
          sourceDocuments.set(item.meta.sourcePdfId, sourceDocument)
        }

        const sourcePage = sourceDocument.getPage(item.meta.pageNumber - 1)
        const cropBox = toCropBox(item)
        const embeddedPage = await outputDocument.embedPage(sourcePage, cropBox)
        const rotation = applyRotationAroundCenter(placement, item.angleDeg)

        outputPage.drawPage(embeddedPage, {
          x: rotation.xPt,
          y: rotation.yPt,
          xScale: placement.widthPt / embeddedPage.width,
          yScale: placement.heightPt / embeddedPage.height,
          rotate: degrees(rotation.rotateDeg),
        })
        report.pdfObjects += 1
        continue
      }

      if (item.kind === 'svg' && item.svgDataUrl) {
        const svgText = decodeSvgText(item.svgDataUrl)
        const vectorDrawn = drawSvgAsVector(svgText, outputPage, placement, item.angleDeg)
        if (vectorDrawn) {
          report.svgVectorObjects += 1
          continue
        }

        await drawSvgAsRaster(item.svgDataUrl, outputPage, placement, outputDocument, item.angleDeg)
        report.svgRasterObjects += 1
        continue
      }

      report.invalidObjects += 1
    }
  }

  if (report.pdfObjects + report.svgVectorObjects + report.svgRasterObjects === 0) {
    throw new Error('未找到可导出对象')
  }

  if (missingSources.size) {
    const missingText = [...missingSources]
      .map((id) => input.sourceNameByPdfId[id] ?? id)
      .join('、')
    throw new Error(`导出对象引用了缺失的源PDF：${missingText}`)
  }

  return {
    bytes: await outputDocument.save(),
    report,
  }
}
