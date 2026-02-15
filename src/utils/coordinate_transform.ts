import { EXPORT_CALIBRATION } from '@/utils/constants'

type MapInput = {
  leftPx: number
  topPx: number
  widthPx: number
  heightPx: number
  canvasWidthPx: number
  canvasHeightPx: number
  pageWidthPt: number
  pageHeightPt: number
}

export type PdfPlacement = {
  xPt: number
  yPt: number
  widthPt: number
  heightPt: number
}

export const mapCanvasRectToPdf = (input: MapInput): PdfPlacement => {
  const scaleX = (input.pageWidthPt / input.canvasWidthPx) * EXPORT_CALIBRATION.scaleX
  const scaleY = (input.pageHeightPt / input.canvasHeightPx) * EXPORT_CALIBRATION.scaleY
  const widthPt = input.widthPx * scaleX
  const heightPt = input.heightPx * scaleY
  const xPt = input.leftPx * scaleX + EXPORT_CALIBRATION.offsetXPt
  const yPt = input.pageHeightPt - (input.topPx + input.heightPx) * scaleY + EXPORT_CALIBRATION.offsetYPt

  return {
    xPt,
    yPt,
    widthPt,
    heightPt,
  }
}
