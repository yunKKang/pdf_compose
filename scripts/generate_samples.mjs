import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'

const outDir = join(process.cwd(), 'samples')

const createLineTextSample = async () => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  page.drawText('Sample A: line + text', { x: 48, y: 796, size: 14, font })
  for (let i = 0; i < 20; i += 1) {
    const y = 740 - i * 18
    page.drawLine({ start: { x: 60, y }, end: { x: 540, y }, color: rgb(0.1, 0.2, 0.4), thickness: 0.5 })
  }

  page.drawText('Micro font 8pt for quality check', { x: 64, y: 360, size: 8, font, color: rgb(0.2, 0.2, 0.2) })
  return pdf.save()
}

const createRotationCropSample = async () => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  page.drawText('Sample B: rotation + crop', { x: 48, y: 796, size: 14, font })

  page.drawRectangle({ x: 120, y: 520, width: 220, height: 120, borderColor: rgb(0.0, 0.4, 0.5), borderWidth: 1.2 })
  page.drawText('Box-1', { x: 128, y: 620, size: 12, font })

  page.drawRectangle({ x: 320, y: 420, width: 180, height: 180, rotate: degrees(24), borderColor: rgb(0.6, 0.2, 0.1), borderWidth: 1.2 })
  page.drawText('Rotated block', { x: 338, y: 512, size: 11, font })

  return pdf.save()
}

const createTransparencySample = async () => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  page.drawText('Sample C: transparency', { x: 48, y: 796, size: 14, font })

  page.drawRectangle({ x: 120, y: 500, width: 240, height: 180, color: rgb(0.1, 0.5, 0.9), opacity: 0.45 })
  page.drawRectangle({ x: 220, y: 430, width: 240, height: 180, color: rgb(0.95, 0.4, 0.2), opacity: 0.45 })
  page.drawRectangle({ x: 170, y: 360, width: 240, height: 180, color: rgb(0.2, 0.75, 0.5), opacity: 0.45 })

  page.drawText('Alpha overlap region', { x: 210, y: 540, size: 12, font, color: rgb(0.2, 0.2, 0.2) })
  return pdf.save()
}

const main = async () => {
  await mkdir(outDir, { recursive: true })

  const [a, b, c] = await Promise.all([
    createLineTextSample(),
    createRotationCropSample(),
    createTransparencySample(),
  ])

  await Promise.all([
    writeFile(join(outDir, 'sample_a_line_text.pdf'), a),
    writeFile(join(outDir, 'sample_b_rotation_crop.pdf'), b),
    writeFile(join(outDir, 'sample_c_transparency.pdf'), c),
  ])

  process.stdout.write(`Generated samples in ${outDir}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
