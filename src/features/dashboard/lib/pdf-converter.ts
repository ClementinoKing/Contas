import { resolveR2ObjectUrl } from '@/lib/r2'
import type { PDFPageProxy } from 'pdfjs-dist'

export type PdfConversionTarget = 'excel' | 'word' | 'powerpoint'

export type DrivePdfDocument = {
  id: string
  name: string
  size: number
  storagePath: string
  uploadedAt: string
}

export type SelectedPdfSource =
  | { kind: 'local'; file: File }
  | { kind: 'drive'; document: DrivePdfDocument }

type ExtractedPdfPage = {
  pageNumber: number
  lines: string[]
}

type DocxParagraph = import('docx').Paragraph

export type PdfConversionResult = {
  fileName: string
  blob: Blob
}

export type PdfConversionProgress = {
  percent: number
  label: string
  detail?: string
}

function stripPdfExtension(fileName: string) {
  return fileName.replace(/\.pdf$/i, '')
}

function getOutputFileName(source: SelectedPdfSource, target: PdfConversionTarget) {
  const sourceName = source.kind === 'drive' ? source.document.name : source.file.name
  const baseName = stripPdfExtension(sourceName).trim() || 'converted-document'
  const extension = target === 'excel' ? 'xlsx' : target === 'word' ? 'docx' : 'pptx'
  return `${baseName}.${extension}`
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

const PDFJS_STANDARD_FONT_DATA_URL = `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`
const TESSERACT_WORKER_PATH = `${import.meta.env.BASE_URL}tesseract/worker.min.js`
const TESSERACT_CORE_PATH = `${import.meta.env.BASE_URL}tesseract/core`
const TESSERACT_LANG_PATH = `${import.meta.env.BASE_URL}tesseract/lang-data/eng/4.0.0_best_int`

type PdfTextItem = {
  str: string
  transform: number[]
}

function isTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    typeof (item as { str?: unknown }).str === 'string' &&
    'transform' in item &&
    Array.isArray((item as { transform?: unknown }).transform)
  )
}

function groupPageText(textItems: PdfTextItem[]) {
  const positionedItems = textItems
    .map((item) => ({
      text: normalizeText(item.str),
      x: Number(item.transform?.[4] ?? 0),
      y: Number(item.transform?.[5] ?? 0),
    }))
    .filter((item) => item.text.length > 0)

  if (positionedItems.length === 0) return []

  const sortedItems = positionedItems.sort((left, right) => right.y - left.y || left.x - right.x)
  const lines: Array<{ y: number; items: typeof positionedItems }> = []
  const lineThreshold = 3

  for (const item of sortedItems) {
    const existingLine = lines.find((line) => Math.abs(line.y - item.y) <= lineThreshold)
    if (!existingLine) {
      lines.push({ y: item.y, items: [item] })
      continue
    }

    existingLine.items.push(item)
    existingLine.y = (existingLine.y * (existingLine.items.length - 1) + item.y) / existingLine.items.length
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => line.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

async function loadPdfBytes(source: SelectedPdfSource) {
  if (source.kind === 'local') {
    return new Uint8Array(await source.file.arrayBuffer())
  }

  const objectUrl = await resolveR2ObjectUrl(source.document.storagePath)
  const response = await fetch(objectUrl)
  if (!response.ok) {
    throw new Error(`Could not load "${source.document.name}" from My Drive.`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

let ocrWorkerPromise: Promise<import('tesseract.js').Worker> | null = null
let ocrProgressReporter: ((progress: PdfConversionProgress) => void) | null = null

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, {
        workerPath: TESSERACT_WORKER_PATH,
        corePath: TESSERACT_CORE_PATH,
        langPath: TESSERACT_LANG_PATH,
        logger: (message) => {
          const baseProgress = typeof message.progress === 'number' ? Math.max(0, Math.min(1, message.progress)) : 0
          const percent = 72 + Math.round(baseProgress * 28)
          const status = message.status.toLowerCase()
          let label = 'OCR fallback'

          if (status.includes('loading tesseract core')) {
            label = 'Loading OCR engine'
          } else if (status.includes('loading') && status.includes('traineddata')) {
            label = 'Loading OCR language'
          } else if (status.includes('initializing')) {
            label = 'Initializing OCR'
          } else if (status.includes('recognizing')) {
            label = 'Recognizing text'
          } else if (status.includes('loading language')) {
            label = 'Loading OCR language'
          }

          ocrProgressReporter?.({
            percent,
            label,
            detail: message.status,
          })
        },
      })
      await worker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '220',
      })
      return worker
    })().catch((error) => {
      ocrWorkerPromise = null
      throw error
    })
  }

  return await ocrWorkerPromise
}

async function ocrPageText(page: PDFPageProxy, pageNumber: number, totalPages: number, onProgress?: (progress: PdfConversionProgress) => void) {
  onProgress?.({
    percent: 72 + Math.round((pageNumber / totalPages) * 10),
    label: 'OCR fallback',
    detail: `Rendering scanned page ${pageNumber} of ${totalPages}`,
  })

  const viewport = page.getViewport({ scale: 1.75 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d', { alpha: false })

  if (!context) {
    throw new Error('OCR fallback could not create a canvas.')
  }

  await page.render({ canvasContext: context, canvas, viewport }).promise

  onProgress?.({
    percent: 82 + Math.round((pageNumber / totalPages) * 8),
    label: 'OCR fallback',
    detail: `Reading scanned page ${pageNumber} of ${totalPages}`,
  })

  const worker = await getOcrWorker()
  const result = await worker.recognize(canvas)
  const text = result.data.text ?? ''
  return text
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
  .filter(Boolean)
}

async function extractPdfPages(source: SelectedPdfSource, onProgress?: (progress: PdfConversionProgress) => void) {
  const data = await loadPdfBytes(source)
  const { getDocument } = await import('pdfjs-dist/webpack.mjs')
  onProgress?.({ percent: 5, label: 'Loading PDF' })
  const loadingTask = getDocument({
    data,
    standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL,
  })
  ocrProgressReporter = onProgress ?? null

  try {
    const pdfDocument = await loadingTask.promise
    const pageNumbers = Array.from({ length: pdfDocument.numPages }, (_, index) => index + 1)
    const pages: ExtractedPdfPage[] = []

    for (const pageNumber of pageNumbers) {
      onProgress?.({
        percent: 10 + Math.round(((pageNumber - 1) / pageNumbers.length) * 70),
        label: 'Extracting text',
        detail: `Reading page ${pageNumber} of ${pageNumbers.length}`,
      })

      const page = await pdfDocument.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const lines = groupPageText((textContent.items as unknown[]).filter(isTextItem))

      if (lines.length === 0) {
        const ocrLines = await ocrPageText(page, pageNumber, pageNumbers.length, onProgress)
        pages.push({
          pageNumber,
          lines: ocrLines.length > 0 ? ocrLines : ['No extractable text found on this page.'],
        })
        onProgress?.({
          percent: 10 + Math.round((pageNumber / pageNumbers.length) * 70),
          label: 'OCR fallback',
          detail: `${pageNumber} of ${pageNumbers.length} pages complete`,
        })
        continue
      }

      pages.push({
        pageNumber,
        lines: lines.length > 0 ? lines : ['No extractable text found on this page.'],
      })

      onProgress?.({
        percent: 10 + Math.round((pageNumber / pageNumbers.length) * 70),
        label: 'Extracting text',
        detail: `${pageNumber} of ${pageNumbers.length} pages complete`,
      })
    }

    return {
      title: source.kind === 'drive' ? source.document.name : source.file.name,
      pages,
    }
  } finally {
    ocrProgressReporter = null
    loadingTask.destroy()
  }
}

async function buildWordBlob(source: SelectedPdfSource, onProgress?: (progress: PdfConversionProgress) => void) {
  const { AlignmentType, Document, HeadingLevel, Paragraph, Packer, TextRun } = await import('docx')
  const extracted = await extractPdfPages(source, onProgress)
  onProgress?.({ percent: 92, label: 'Building Word file' })
  const children: DocxParagraph[] = []

  extracted.pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      children.push(new Paragraph({ pageBreakBefore: true }))
    }

    children.push(
      new Paragraph({
        text: `Page ${page.pageNumber}`,
        heading: HeadingLevel.HEADING_1,
      }),
    )

    page.lines.forEach((line) => {
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            new TextRun({
              text: line,
            }),
          ],
        }),
      )
    })
  })

  const document = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  })

  const result = {
    fileName: getOutputFileName(source, 'word'),
    blob: await Packer.toBlob(document),
  }
  onProgress?.({ percent: 100, label: 'Conversion complete' })
  return result
}

async function buildExcelBlob(source: SelectedPdfSource, onProgress?: (progress: PdfConversionProgress) => void) {
  const XLSX = await import('xlsx')
  const extracted = await extractPdfPages(source, onProgress)
  onProgress?.({ percent: 92, label: 'Building Excel file' })
  const rows: Array<[string | number, string | number, string]> = [['Page', 'Line', 'Text']]

  extracted.pages.forEach((page) => {
    page.lines.forEach((line, lineIndex) => {
      rows.push([page.pageNumber, lineIndex + 1, line])
    })
  })

  if (rows.length === 1) {
    rows.push([1, 1, 'No extractable text found on this PDF.'])
  }

  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Extracted Text')

  const arrayBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    compression: true,
    type: 'array',
  })

  const result = {
    fileName: getOutputFileName(source, 'excel'),
    blob: new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  }
  onProgress?.({ percent: 100, label: 'Conversion complete' })
  return result
}

async function buildPowerPointBlob(source: SelectedPdfSource, onProgress?: (progress: PdfConversionProgress) => void) {
  const PptxGenJSModule = await import('pptxgenjs')
  const PptxGenJS = PptxGenJSModule.default
  const extracted = await extractPdfPages(source, onProgress)
  onProgress?.({ percent: 92, label: 'Building PowerPoint file' })
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Contas CRM'
  pptx.company = 'Contas CRM'
  pptx.subject = 'PDF conversion output'
  pptx.title = extracted.title

  extracted.pages.forEach((page) => {
    const slide = pptx.addSlide()
    slide.background = { color: 'F8FAFC' }

    slide.addText(`Page ${page.pageNumber}`, {
      x: 0.6,
      y: 0.45,
      w: 12.2,
      h: 0.4,
      fontFace: 'Aptos',
      fontSize: 20,
      bold: true,
      color: '0F172A',
      margin: 0,
    })

    slide.addText(
      page.lines.join('\n'),
      {
        x: 0.7,
        y: 1.0,
        w: 12.0,
        h: 5.7,
        fontFace: 'Aptos',
        fontSize: 12,
        color: '334155',
        margin: 0,
        valign: 'top',
      },
    )
  })

  const blob = await pptx.write({ outputType: 'blob' })

  if (!(blob instanceof Blob)) {
    throw new Error('PowerPoint export failed.')
  }

  const result = {
    fileName: getOutputFileName(source, 'powerpoint'),
    blob,
  }
  onProgress?.({ percent: 100, label: 'Conversion complete' })
  return result
}

export async function convertPdfSource(
  source: SelectedPdfSource,
  target: PdfConversionTarget,
  onProgress?: (progress: PdfConversionProgress) => void,
): Promise<PdfConversionResult> {
  onProgress?.({ percent: 0, label: 'Starting conversion' })
  if (target === 'excel') return await buildExcelBlob(source, onProgress)
  if (target === 'word') return await buildWordBlob(source, onProgress)
  return await buildPowerPointBlob(source, onProgress)
}
