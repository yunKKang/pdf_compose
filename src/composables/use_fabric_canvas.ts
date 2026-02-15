import { Canvas, FabricImage, Line, Rect } from 'fabric'
import type { CanvasExportItem, CanvasPdfMeta } from '@/types'

type CanvasItem = {
  thumbnailDataUrl: string
  meta: CanvasPdfMeta
  left: number
  top: number
}

type SvgCanvasItem = {
  dataUrl: string
  left: number
  top: number
}

type CropPayload = {
  leftPct: number
  topPct: number
  rightPct: number
  bottomPct: number
}

type ActiveObjectSize = {
  widthPx: number
  heightPx: number
}

const DEFAULT_CANVAS_WIDTH = 960
const DEFAULT_CANVAS_HEIGHT = 680
const GRID_SIZE = 20
const MAX_HISTORY = 100
const ALIGN_THRESHOLD = 8

type MatchAxis = 'x' | 'y'

type AxisMatch = {
  axis: MatchAxis
  delta: number
  guide: number
}

FabricImage.customProperties = [...new Set([...FabricImage.customProperties, 'pageMeta', 'assetKind', 'svgDataUrl', 'outputPage'])]

const getSourceSize = (element: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement) => {
  if (element instanceof HTMLImageElement) {
    return {
      width: element.naturalWidth || element.width,
      height: element.naturalHeight || element.height,
    }
  }

  if (element instanceof HTMLVideoElement) {
    return {
      width: element.videoWidth || element.width,
      height: element.videoHeight || element.height,
    }
  }

  return {
    width: element.width,
    height: element.height,
  }
}

export const useFabricCanvas = () => {
  let canvas: Canvas | null = null
  let cropFrame: Rect | null = null
  let cropTarget: FabricImage | null = null
  let history: string[] = []
  let historyIndex = -1
  let restoring = false
  let snapEnabled = false
  let alignGuides: Line[] = []
  let selectionListeners: Array<(size: ActiveObjectSize | null) => void> = []

  const emitSelectionChange = () => {
    const activeImage = getActiveImage()
    if (!activeImage) {
      selectionListeners.forEach((listener) => {
        listener(null)
      })
      return
    }

    selectionListeners.forEach((listener) => {
      listener({
        widthPx: Math.round(activeImage.getScaledWidth() * 100) / 100,
        heightPx: Math.round(activeImage.getScaledHeight() * 100) / 100,
      })
    })
  }

  const clearAlignGuides = () => {
    if (!canvas || !alignGuides.length) {
      return
    }

    const canvasRef = canvas

    alignGuides.forEach((line) => {
      canvasRef.remove(line)
    })
    alignGuides = []
    canvasRef.requestRenderAll()
  }

  const addVerticalGuide = (x: number) => {
    if (!canvas) {
      return
    }

    const canvasRef = canvas

    const line = new Line([x, 0, x, canvasRef.getHeight()], {
      stroke: '#ef4444',
      strokeWidth: 1,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    })
    alignGuides.push(line)
    canvasRef.add(line)
    canvasRef.bringObjectToFront(line)
  }

  const addHorizontalGuide = (y: number) => {
    if (!canvas) {
      return
    }

    const canvasRef = canvas

    const line = new Line([0, y, canvasRef.getWidth(), y], {
      stroke: '#ef4444',
      strokeWidth: 1,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    })
    alignGuides.push(line)
    canvasRef.add(line)
    canvasRef.bringObjectToFront(line)
  }

  const pickBestMatch = (matches: AxisMatch[], axis: MatchAxis) => {
    const axisMatches = matches.filter((item) => item.axis === axis)
    if (!axisMatches.length) {
      return null
    }

    return axisMatches.reduce((best, current) => {
      if (!best) {
        return current
      }

      return Math.abs(current.delta) < Math.abs(best.delta) ? current : best
    }, null as AxisMatch | null)
  }

  const getRectAnchors = (left: number, top: number, width: number, height: number) => ({
    x: [left, left + width / 2, left + width],
    y: [top, top + height / 2, top + height],
  })

  const pushHistory = () => {
    if (!canvas || restoring) {
      return
    }

    const snapshot = JSON.stringify(canvas.toJSON())
    if (history[historyIndex] === snapshot) {
      return
    }

    history = history.slice(0, historyIndex + 1)
    history.push(snapshot)
    if (history.length > MAX_HISTORY) {
      history.shift()
    }
    historyIndex = history.length - 1
  }

  const init = (el: HTMLCanvasElement) => {
    canvas = new Canvas(el, {
      selection: true,
      preserveObjectStacking: true,
      backgroundColor: '#ffffff',
      width: DEFAULT_CANVAS_WIDTH,
      height: DEFAULT_CANVAS_HEIGHT,
    })

    canvas.on('mouse:wheel', (event) => {
      const wheelDelta = event.e.deltaY
      const pointer = canvas?.getScenePoint(event.e)

      if (!pointer || !event.e.ctrlKey || !canvas) {
        return
      }

      let zoom = canvas.getZoom()
      zoom *= 0.999 ** wheelDelta
      zoom = Math.min(2.5, Math.max(0.35, zoom))
      canvas.zoomToPoint(pointer, zoom)
      event.e.preventDefault()
      event.e.stopPropagation()
    })

    canvas.on('object:moving', (event) => {
      if (!snapEnabled || !event.target) {
        return
      }

      clearAlignGuides()

      const canvasRef = canvas
      if (!canvasRef) {
        return
      }

      const movingObject = event.target
      let nextLeft = movingObject.left ?? 0
      let nextTop = movingObject.top ?? 0
      const movingRect = movingObject.getBoundingRect()
      const objects = canvasRef.getObjects()
      const matches: AxisMatch[] = []
      const marginGuide = 24

      const movingAnchors = getRectAnchors(
        movingRect.left,
        movingRect.top,
        movingRect.width,
        movingRect.height,
      )

      const canvasAnchors = {
        x: [0, marginGuide, canvasRef.getWidth() / 2, canvasRef.getWidth() - marginGuide, canvasRef.getWidth()],
        y: [0, marginGuide, canvasRef.getHeight() / 2, canvasRef.getHeight() - marginGuide, canvasRef.getHeight()],
      }

      for (const movingX of movingAnchors.x) {
        for (const guideX of canvasAnchors.x) {
          const delta = guideX - movingX
          if (Math.abs(delta) <= ALIGN_THRESHOLD) {
            matches.push({
              axis: 'x',
              delta,
              guide: guideX,
            })
          }
        }
      }

      for (const movingY of movingAnchors.y) {
        for (const guideY of canvasAnchors.y) {
          const delta = guideY - movingY
          if (Math.abs(delta) <= ALIGN_THRESHOLD) {
            matches.push({
              axis: 'y',
              delta,
              guide: guideY,
            })
          }
        }
      }

      for (const object of objects) {
        if (object === movingObject || object instanceof Line) {
          continue
        }

        const otherRect = object.getBoundingRect()
        const otherAnchors = getRectAnchors(
          otherRect.left,
          otherRect.top,
          otherRect.width,
          otherRect.height,
        )

        for (const movingX of movingAnchors.x) {
          for (const otherX of otherAnchors.x) {
            const delta = otherX - movingX
            if (Math.abs(delta) <= ALIGN_THRESHOLD) {
              matches.push({
                axis: 'x',
                delta,
                guide: otherX,
              })
            }
          }
        }

        for (const movingY of movingAnchors.y) {
          for (const otherY of otherAnchors.y) {
            const delta = otherY - movingY
            if (Math.abs(delta) <= ALIGN_THRESHOLD) {
              matches.push({
                axis: 'y',
                delta,
                guide: otherY,
              })
            }
          }
        }
      }

      const bestX = pickBestMatch(matches, 'x')
      const bestY = pickBestMatch(matches, 'y')

      if (bestX) {
        nextLeft += bestX.delta
        addVerticalGuide(bestX.guide)
      }

      if (bestY) {
        nextTop += bestY.delta
        addHorizontalGuide(bestY.guide)
      }

      const snappedLeft = bestX ? nextLeft : Math.round(nextLeft / GRID_SIZE) * GRID_SIZE
      const snappedTop = bestY ? nextTop : Math.round(nextTop / GRID_SIZE) * GRID_SIZE

      event.target.set({
        left: snappedLeft,
        top: snappedTop,
      })
    })

    canvas.on('mouse:up', () => {
      clearAlignGuides()
    })

    canvas.on('selection:created', emitSelectionChange)
    canvas.on('selection:updated', emitSelectionChange)
    canvas.on('selection:cleared', emitSelectionChange)
    canvas.on('object:modified', emitSelectionChange)

    pushHistory()
  }

  const dispose = () => {
    cropFrame = null
    cropTarget = null
    alignGuides = []
    canvas?.dispose()
    canvas = null
    history = []
    historyIndex = -1
    restoring = false
    selectionListeners = []
  }

  const addPdfItem = async (item: CanvasItem) => {
    if (!canvas) {
      return
    }

    const image = await FabricImage.fromURL(item.thumbnailDataUrl)
    if (!image.width || !image.height) {
      return
    }
    const targetWidth = 280
    const scaleX = targetWidth / image.width
    const scaleY = targetWidth / image.width

    image.set({
      left: item.left,
      top: item.top,
      scaleX,
      scaleY,
      cornerStyle: 'circle',
      transparentCorners: false,
      borderColor: '#0f766e',
      cornerColor: '#0f766e',
      strokeUniform: true,
      objectCaching: false,
    })

    image.set('pageMeta', item.meta)
    image.set('outputPage', item.meta.outputPage)
    canvas.add(image)
    canvas.setActiveObject(image)
    canvas.requestRenderAll()
    emitSelectionChange()
    pushHistory()
  }

  const addSvgItem = async (item: SvgCanvasItem) => {
    if (!canvas) {
      return
    }

    const image = await FabricImage.fromURL(item.dataUrl)
    if (!image.width || !image.height) {
      return
    }
    const targetWidth = 220
    const scaleX = targetWidth / image.width
    const scaleY = targetWidth / image.width

    image.set({
      left: item.left,
      top: item.top,
      scaleX,
      scaleY,
      cornerStyle: 'circle',
      transparentCorners: false,
      borderColor: '#334155',
      cornerColor: '#334155',
      strokeUniform: true,
      objectCaching: false,
    })

    image.set('assetKind', 'svg')
    image.set('svgDataUrl', item.dataUrl)
    image.set('outputPage', 1)

    canvas.add(image)
    canvas.setActiveObject(image)
    canvas.requestRenderAll()
    emitSelectionChange()
    pushHistory()
  }

  const getActiveImage = () => {
    if (!canvas) {
      return null
    }

    const activeObject = canvas.getActiveObject()
    if (!activeObject || !(activeObject instanceof FabricImage)) {
      return null
    }

    return activeObject
  }

  const applyCropToActive = (crop: CropPayload) => {
    const activeImage = getActiveImage()
    if (!activeImage) {
      return
    }

    const element = activeImage.getElement()
    if (!(element instanceof HTMLImageElement || element instanceof HTMLCanvasElement || element instanceof HTMLVideoElement)) {
      return
    }

    const sourceSize = getSourceSize(element)
    const sourceWidth = sourceSize.width
    const sourceHeight = sourceSize.height
    const cropX = sourceWidth * crop.leftPct
    const cropY = sourceHeight * crop.topPct
    const cropWidth = sourceWidth * (1 - crop.leftPct - crop.rightPct)
    const cropHeight = sourceHeight * (1 - crop.topPct - crop.bottomPct)

    if (cropWidth <= 4 || cropHeight <= 4) {
      return
    }

    activeImage.set({
      cropX,
      cropY,
      width: cropWidth,
      height: cropHeight,
    })

    const currentMeta = activeImage.get('pageMeta') as CanvasPdfMeta | undefined
    const nextMeta: CanvasPdfMeta | undefined = currentMeta
      ? {
          ...currentMeta,
          cropLeftPct: crop.leftPct,
          cropTopPct: crop.topPct,
          cropRightPct: crop.rightPct,
          cropBottomPct: crop.bottomPct,
        }
      : undefined

    if (nextMeta) {
      activeImage.set('pageMeta', nextMeta)
    }

    canvas?.requestRenderAll()
    pushHistory()
  }

  const startCropFrame = () => {
    const activeImage = getActiveImage()
    if (!activeImage || !canvas) {
      return
    }

    if (cropFrame) {
      canvas.remove(cropFrame)
      cropFrame = null
      cropTarget = null
    }

    const frame = new Rect({
      left: activeImage.left,
      top: activeImage.top,
      width: activeImage.getScaledWidth(),
      height: activeImage.getScaledHeight(),
      fill: 'rgba(15, 118, 110, 0.08)',
      stroke: '#0f766e',
      strokeWidth: 1,
      strokeDashArray: [6, 6],
      cornerStyle: 'circle',
      transparentCorners: false,
      cornerColor: '#0f766e',
      cornerSize: 8,
      objectCaching: false,
    })

    cropFrame = frame
    cropTarget = activeImage
    canvas.add(frame)
    canvas.setActiveObject(frame)
    canvas.requestRenderAll()
    pushHistory()
  }

  const cancelCropFrame = () => {
    if (!canvas || !cropFrame) {
      return
    }

    canvas.remove(cropFrame)
    cropFrame = null
    cropTarget = null
    canvas.requestRenderAll()
    pushHistory()
  }

  const applyCropFromFrame = () => {
    if (!cropFrame || !cropTarget || !canvas) {
      return
    }

    const targetImage = cropTarget

    const targetLeft = targetImage.left ?? 0
    const targetTop = targetImage.top ?? 0
    const targetWidth = targetImage.getScaledWidth()
    const targetHeight = targetImage.getScaledHeight()
    const frameLeft = cropFrame.left ?? 0
    const frameTop = cropFrame.top ?? 0
    const frameWidth = cropFrame.getScaledWidth()
    const frameHeight = cropFrame.getScaledHeight()

    const leftPct = Math.max(0, (frameLeft - targetLeft) / targetWidth)
    const topPct = Math.max(0, (frameTop - targetTop) / targetHeight)
    const rightPct = Math.max(0, (targetLeft + targetWidth - (frameLeft + frameWidth)) / targetWidth)
    const bottomPct = Math.max(0, (targetTop + targetHeight - (frameTop + frameHeight)) / targetHeight)

    canvas.remove(cropFrame)
    cropFrame = null
    cropTarget = null

    canvas.setActiveObject(targetImage)
    applyCropToActive({
      leftPct,
      topPct,
      rightPct,
      bottomPct,
    })
    canvas.requestRenderAll()
    pushHistory()
  }

  const resetCropOnActive = () => {
    const activeImage = getActiveImage()
    if (!activeImage) {
      return
    }

    const element = activeImage.getElement()
    if (!(element instanceof HTMLImageElement || element instanceof HTMLCanvasElement || element instanceof HTMLVideoElement)) {
      return
    }

    const sourceSize = getSourceSize(element)
    const sourceWidth = sourceSize.width
    const sourceHeight = sourceSize.height

    activeImage.set({
      cropX: 0,
      cropY: 0,
      width: sourceWidth,
      height: sourceHeight,
    })

    const currentMeta = activeImage.get('pageMeta') as CanvasPdfMeta | undefined
    if (currentMeta) {
      activeImage.set('pageMeta', {
        ...currentMeta,
        cropLeftPct: 0,
        cropTopPct: 0,
        cropRightPct: 0,
        cropBottomPct: 0,
      })
    }

    canvas?.requestRenderAll()
    pushHistory()
  }

  const removeSelected = () => {
    if (!canvas) {
      return
    }

    const active = canvas.getActiveObjects()
    if (!active.length) {
      return
    }

    active.forEach((object) => {
      canvas?.remove(object)
    })
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    emitSelectionChange()
    pushHistory()
  }

  const resetView = () => {
    if (!canvas) {
      return
    }

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    canvas.requestRenderAll()
  }

  const setGridSnapEnabled = (enabled: boolean) => {
    snapEnabled = enabled
  }

  const setCanvasSize = (widthPx: number, heightPx: number) => {
    if (!canvas) {
      return
    }

    const nextWidth = Math.max(320, Math.floor(widthPx))
    const nextHeight = Math.max(320, Math.floor(heightPx))
    canvas.setDimensions({ width: nextWidth, height: nextHeight })
    canvas.requestRenderAll()
    pushHistory()
  }

  const undo = async () => {
    if (!canvas || historyIndex <= 0) {
      return
    }

    const nextIndex = historyIndex - 1
    const snapshot = history[nextIndex]
    if (!snapshot) {
      return
    }

    historyIndex = nextIndex
    restoring = true
    await canvas.loadFromJSON(snapshot)
    canvas.requestRenderAll()
    restoring = false
  }

  const redo = async () => {
    if (!canvas || historyIndex >= history.length - 1) {
      return
    }

    const nextIndex = historyIndex + 1
    const snapshot = history[nextIndex]
    if (!snapshot) {
      return
    }

    historyIndex = nextIndex
    restoring = true
    await canvas.loadFromJSON(snapshot)
    canvas.requestRenderAll()
    restoring = false
  }

  const alignLeft = () => {
    if (!canvas) {
      return
    }

    const selected = canvas.getActiveObjects()
    if (selected.length < 2) {
      return
    }

    const minLeft = Math.min(...selected.map((item) => item.left ?? 0))
    selected.forEach((item) => {
      item.set('left', minLeft)
      item.setCoords()
    })
    canvas.requestRenderAll()
    pushHistory()
  }

  const alignTop = () => {
    if (!canvas) {
      return
    }

    const selected = canvas.getActiveObjects()
    if (selected.length < 2) {
      return
    }

    const minTop = Math.min(...selected.map((item) => item.top ?? 0))
    selected.forEach((item) => {
      item.set('top', minTop)
      item.setCoords()
    })
    canvas.requestRenderAll()
    pushHistory()
  }

  const alignCenter = () => {
    if (!canvas) {
      return
    }

    const selected = canvas.getActiveObjects()
    if (selected.length < 2) {
      return
    }

    const centerX =
      selected.reduce((acc, item) => acc + (item.left ?? 0) + item.getScaledWidth() / 2, 0) / selected.length

    selected.forEach((item) => {
      item.set('left', centerX - item.getScaledWidth() / 2)
      item.setCoords()
    })
    canvas.requestRenderAll()
    pushHistory()
  }

  const layerForward = () => {
    if (!canvas) {
      return
    }

    const canvasRef = canvas

    canvasRef.getActiveObjects().forEach((item) => {
      canvasRef.bringObjectForward(item)
      item.setCoords()
    })
    canvasRef.requestRenderAll()
    pushHistory()
  }

  const layerBackward = () => {
    if (!canvas) {
      return
    }

    const canvasRef = canvas

    canvasRef.getActiveObjects().forEach((item) => {
      canvasRef.sendObjectBackwards(item)
      item.setCoords()
    })
    canvasRef.requestRenderAll()
    pushHistory()
  }

  const layerToFront = () => {
    if (!canvas) {
      return
    }

    const canvasRef = canvas

    canvasRef.getActiveObjects().forEach((item) => {
      canvasRef.bringObjectToFront(item)
      item.setCoords()
    })
    canvasRef.requestRenderAll()
    pushHistory()
  }

  const layerToBack = () => {
    if (!canvas) {
      return
    }

    const canvasRef = canvas

    canvasRef.getActiveObjects().forEach((item) => {
      canvasRef.sendObjectToBack(item)
      item.setCoords()
    })
    canvasRef.requestRenderAll()
    pushHistory()
  }

  const assignSelectionToPage = (pageNo: number) => {
    if (!canvas || pageNo < 1) {
      return
    }

    canvas.getActiveObjects().forEach((item) => {
      if (!(item instanceof FabricImage)) {
        return
      }

      const currentMeta = item.get('pageMeta') as CanvasPdfMeta | undefined
      if (currentMeta) {
        item.set('pageMeta', {
          ...currentMeta,
          outputPage: pageNo,
        })
      }
      item.set('outputPage', pageNo)
    })

    canvas.requestRenderAll()
    pushHistory()
  }

  const nudgeSelection = (deltaX: number, deltaY: number) => {
    if (!canvas) {
      return
    }

    const selected = canvas.getActiveObjects()
    if (!selected.length) {
      return
    }

    selected.forEach((item) => {
      item.set({
        left: (item.left ?? 0) + deltaX,
        top: (item.top ?? 0) + deltaY,
      })
      item.setCoords()
    })

    canvas.requestRenderAll()
    emitSelectionChange()
    pushHistory()
  }

  const rotateSelection = (deltaDeg: number) => {
    if (!canvas) {
      return
    }

    const selected = canvas.getActiveObjects()
    if (!selected.length) {
      return
    }

    selected.forEach((item) => {
      item.set({
        angle: (item.angle ?? 0) + deltaDeg,
      })
      item.setCoords()
    })

    canvas.requestRenderAll()
    emitSelectionChange()
    pushHistory()
  }

  const getActiveObjectSize = () => {
    const activeImage = getActiveImage()
    if (!activeImage) {
      return null
    }

    return {
      widthPx: Math.round(activeImage.getScaledWidth() * 100) / 100,
      heightPx: Math.round(activeImage.getScaledHeight() * 100) / 100,
    }
  }

  const setActiveObjectSize = (widthPx: number, heightPx: number) => {
    const activeImage = getActiveImage()
    if (!activeImage) {
      return
    }

    const baseWidth = activeImage.width ?? 0
    const baseHeight = activeImage.height ?? 0
    if (baseWidth <= 0 || baseHeight <= 0) {
      return
    }

    const nextWidth = Math.max(8, widthPx)
    const nextHeight = Math.max(8, heightPx)
    const signX = (activeImage.scaleX ?? 1) < 0 ? -1 : 1
    const signY = (activeImage.scaleY ?? 1) < 0 ? -1 : 1

    activeImage.set({
      scaleX: signX * (nextWidth / baseWidth),
      scaleY: signY * (nextHeight / baseHeight),
    })
    activeImage.setCoords()
    canvas?.requestRenderAll()
    emitSelectionChange()
    pushHistory()
  }

  const onSelectionChange = (listener: (size: ActiveObjectSize | null) => void) => {
    selectionListeners.push(listener)
    listener(getActiveObjectSize())

    return () => {
      selectionListeners = selectionListeners.filter((item) => item !== listener)
    }
  }

  const applyTemplate = (template: '2x1' | '2x2') => {
    if (!canvas) {
      return
    }

    const selected = canvas.getActiveObjects()
    if (!selected.length) {
      return
    }

    const margin = 24
    const innerPadding = 12
    const maxSlots = template === '2x1' ? 2 : 4
    const count = Math.min(selected.length, maxSlots)
    const ordered = [...selected]
      .slice(0, count)
      .sort((a, b) => {
        const topDiff = (a.top ?? 0) - (b.top ?? 0)
        if (Math.abs(topDiff) > 8) {
          return topDiff
        }

        return (a.left ?? 0) - (b.left ?? 0)
      })

    const cols = template === '2x1' ? Math.min(2, count) : count === 1 ? 1 : 2
    const rows = template === '2x1' ? 1 : Math.ceil(count / cols)
    const cellWidth = (canvas.getWidth() - margin * (cols + 1)) / cols
    const cellHeight = (canvas.getHeight() - margin * (rows + 1)) / rows

    for (let i = 0; i < count; i += 1) {
      const item = ordered[i]
      if (!item) {
        continue
      }

      const col = i % cols
      const row = Math.floor(i / cols)
      const slotLeft = margin + col * (cellWidth + margin)
      const slotTop = margin + row * (cellHeight + margin)
      const currentWidth = item.getScaledWidth()
      const currentHeight = item.getScaledHeight()

      if (currentWidth <= 0 || currentHeight <= 0) {
        continue
      }

      const baseWidth = item.width ?? currentWidth
      const baseHeight = item.height ?? currentHeight
      if (baseWidth <= 0 || baseHeight <= 0) {
        continue
      }

      const fitScale = Math.min(
        (cellWidth - innerPadding * 2) / baseWidth,
        (cellHeight - innerPadding * 2) / baseHeight,
      )
      const signX = (item.scaleX ?? 1) < 0 ? -1 : 1
      const signY = (item.scaleY ?? 1) < 0 ? -1 : 1
      const placedWidth = baseWidth * Math.abs(fitScale)
      const placedHeight = baseHeight * Math.abs(fitScale)

      item.set({
        scaleX: signX * fitScale,
        scaleY: signY * fitScale,
      })
      item.set({
        left: slotLeft + (cellWidth - placedWidth) / 2,
        top: slotTop + (cellHeight - placedHeight) / 2,
      })
      item.setCoords()
    }

    canvas.requestRenderAll()
    pushHistory()
  }

  const getExportItems = (): CanvasExportItem[] => {
    if (!canvas) {
      return []
    }

    const mappedItems = canvas
      .getObjects()
      .filter((object): object is FabricImage => object instanceof FabricImage)
      .map((image) => {
        const meta = image.get('pageMeta') as CanvasPdfMeta | undefined
        const outputPage = Number(image.get('outputPage') ?? meta?.outputPage ?? 1)
        const assetKind = String(image.get('assetKind') ?? '')
        const svgDataUrl = image.get('svgDataUrl')
        const center = image.getCenterPoint()
        const baseWidth = image.width ?? 0
        const baseHeight = image.height ?? 0
        const scaleX = Math.abs(image.scaleX ?? 1)
        const scaleY = Math.abs(image.scaleY ?? 1)
        const exportWidth = baseWidth * scaleX
        const exportHeight = baseHeight * scaleY
        const exportLeft = center.x - exportWidth / 2
        const exportTop = center.y - exportHeight / 2

        if (meta) {
          return {
            leftPx: exportLeft,
            topPx: exportTop,
            widthPx: exportWidth,
            heightPx: exportHeight,
            angleDeg: image.angle ?? 0,
            outputPage,
            kind: 'pdf' as const,
            meta: {
              ...meta,
              outputPage,
            },
          }
        }

        if (assetKind === 'svg' && typeof svgDataUrl === 'string' && svgDataUrl.length > 0) {
          return {
            leftPx: exportLeft,
            topPx: exportTop,
            widthPx: exportWidth,
            heightPx: exportHeight,
            angleDeg: image.angle ?? 0,
            outputPage,
            kind: 'svg' as const,
            svgDataUrl,
          }
        }

        return null
      })

    const result: CanvasExportItem[] = []
    for (const item of mappedItems) {
      if (!item) {
        continue
      }

      result.push(item)
    }

    return result
  }

  const getCanvasSize = () => ({
    widthPx: canvas?.getWidth() ?? DEFAULT_CANVAS_WIDTH,
    heightPx: canvas?.getHeight() ?? DEFAULT_CANVAS_HEIGHT,
  })

  return {
    init,
    dispose,
    addPdfItem,
    addSvgItem,
    applyCropToActive,
    startCropFrame,
    applyCropFromFrame,
    cancelCropFrame,
    resetCropOnActive,
    removeSelected,
    resetView,
    setGridSnapEnabled,
    setCanvasSize,
    undo,
    redo,
    alignLeft,
    alignTop,
    alignCenter,
    layerForward,
    layerBackward,
    layerToFront,
    layerToBack,
    assignSelectionToPage,
    nudgeSelection,
    rotateSelection,
    applyTemplate,
    getActiveObjectSize,
    setActiveObjectSize,
    onSelectionChange,
    getExportItems,
    getCanvasSize,
  }
}
