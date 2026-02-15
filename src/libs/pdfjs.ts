import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

export const loadPdfDocument = async (sourceBytes: Uint8Array): Promise<PDFDocumentProxy> => {
  const loadingTask = getDocument({ data: sourceBytes })
  return loadingTask.promise
}
