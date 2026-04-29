import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'

const loadCommonJsModule = (source, filename, requireMap = {}) => {
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  })

  const exports = {}
  const require = (specifier) => {
    if (specifier in requireMap) {
      return requireMap[specifier]
    }

    throw new Error(`Unexpected import in regression script: ${specifier}`)
  }

  new Function('require', 'exports', output.outputText)(require, exports)
  return exports
}

const constantsPath = join(process.cwd(), 'src', 'utils', 'constants.ts')
const transformPath = join(process.cwd(), 'src', 'utils', 'coordinate_transform.ts')
const constantsModule = loadCommonJsModule(
  await readFile(constantsPath, 'utf8'),
  constantsPath,
)
const transformModule = loadCommonJsModule(
  await readFile(transformPath, 'utf8'),
  transformPath,
  { '@/utils/constants': constantsModule },
)

const { EXPORT_PAGE } = constantsModule
const { mapCanvasRectToPdf } = transformModule

const closeEnough = (a, b, eps = 0.01) => Math.abs(a - b) <= eps

const withExportPage = (input) => ({
  ...input,
  pageWidthPt: EXPORT_PAGE.widthPt,
  pageHeightPt: EXPORT_PAGE.heightPt,
})

const tests = [
  {
    name: 'Top-left anchor',
    input: withExportPage({ leftPx: 0, topPx: 0, widthPx: 96, heightPx: 68, canvasWidthPx: 960, canvasHeightPx: 680 }),
    expected: { xPt: 0, yPt: 535.752, widthPt: 84.189, heightPt: 59.528 },
  },
  {
    name: 'Bottom-right anchor',
    input: withExportPage({ leftPx: 864, topPx: 612, widthPx: 96, heightPx: 68, canvasWidthPx: 960, canvasHeightPx: 680 }),
    expected: { xPt: 757.701, yPt: 0, widthPt: 84.189, heightPt: 59.528 },
  },
  {
    name: 'Center block',
    input: withExportPage({ leftPx: 240, topPx: 170, widthPx: 480, heightPx: 340, canvasWidthPx: 960, canvasHeightPx: 680 }),
    expected: { xPt: 210.4725, yPt: 148.82, widthPt: 420.945, heightPt: 297.64 },
  },
]

const results = tests.map((test) => {
  const mapped = mapCanvasRectToPdf(test.input)
  const pass =
    closeEnough(mapped.xPt, test.expected.xPt) &&
    closeEnough(mapped.yPt, test.expected.yPt) &&
    closeEnough(mapped.widthPt, test.expected.widthPt) &&
    closeEnough(mapped.heightPt, test.expected.heightPt)

  return {
    ...test,
    mapped,
    pass,
  }
})

const passed = results.every((item) => item.pass)
const shouldWriteReport = process.argv.includes('--write-report')
const lines = [
  '# Export Regression Report',
  '',
  `Date: ${new Date().toISOString()}`,
  `Result: ${passed ? 'PASS' : 'FAIL'}`,
  '',
  '| Case | Pass | Expected | Actual |',
  '|------|------|----------|--------|',
]

for (const result of results) {
  lines.push(
    `| ${result.name} | ${result.pass ? 'YES' : 'NO'} | x=${result.expected.xPt.toFixed(3)}, y=${result.expected.yPt.toFixed(3)}, w=${result.expected.widthPt.toFixed(3)}, h=${result.expected.heightPt.toFixed(3)} | x=${result.mapped.xPt.toFixed(3)}, y=${result.mapped.yPt.toFixed(3)}, w=${result.mapped.widthPt.toFixed(3)}, h=${result.mapped.heightPt.toFixed(3)} |`,
  )
}

const output = lines.join('\n')
if (shouldWriteReport) {
  await writeFile(join(process.cwd(), 'samples', 'export_regression_report.md'), output)
}

const reportText = shouldWriteReport ? ' - wrote samples/export_regression_report.md' : ''
process.stdout.write(`${passed ? 'PASS' : 'FAIL'}${reportText}\n`)
process.exitCode = passed ? 0 : 1
