import { resolveR2ObjectUrl } from '@/lib/r2'

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

function getSourceName(source: SelectedPdfSource) {
  return source.kind === 'drive' ? source.document.name : source.file.name
}

function getOutputFileName(source: SelectedPdfSource, target: PdfConversionTarget) {
  const baseName = stripPdfExtension(getSourceName(source)).trim() || 'converted-document'
  const extension = target === 'excel' ? 'xlsx' : target === 'word' ? 'docx' : 'pptx'
  return `${baseName}.${extension}`
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

const PDFJS_STANDARD_FONT_DATA_URL = `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
const PDF_CONVERT_FUNCTION = 'pdf-convert'

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

function groupPageText(textItems: Array<{ str?: string; transform?: number[] }>) {
  const positionedItems = textItems
    .map((item) => ({
      text: normalizeText(String(item.str ?? '')),
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

async function loadPdfFile(source: SelectedPdfSource) {
  const bytes = await loadPdfBytes(source)
  return new File([bytes], getSourceName(source), { type: 'application/pdf' })
}

async function convertWithServerEngine(
  source: SelectedPdfSource,
  target: PdfConversionTarget,
  onProgress?: (progress: PdfConversionProgress) => void,
) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration is missing.')
  }

  const fileName = getOutputFileName(source, target)
  const bytes = await loadPdfBytes(source)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 60_000)

  onProgress?.({
    percent: 12,
    label: 'Uploading PDF',
    detail: 'Sending the document to the conversion engine.',
  })

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${PDF_CONVERT_FUNCTION}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        fileName: getSourceName(source),
        pdfBase64: bytesToBase64(bytes),
        target,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || `The conversion service returned ${response.status}.`)
    }

    const blob = await response.blob()
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error('The conversion service did not return a file.')
    }

    onProgress?.({
      percent: 100,
      label: 'Conversion complete',
      detail: `Prepared ${fileName}.`,
    })

    return {
      fileName,
      blob,
    }
  } finally {
    window.clearTimeout(timeout)
  }
}

async function extractTextPdfPages(source: SelectedPdfSource, onProgress?: (progress: PdfConversionProgress) => void) {
  const data = await loadPdfBytes(source)
  const { getDocument } = await import('pdfjs-dist/webpack.mjs')
  const loadingTask = getDocument({
    data,
    disableWorker: true,
    standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL,
  } as any)

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
      const lines = groupPageText(textContent.items as Array<{ str?: string; transform?: number[] }>)

      pages.push({
        pageNumber,
        lines: lines.length > 0 ? lines : ['No extractable text found on this page.'],
      })
    }

    return {
      title: source.kind === 'drive' ? source.document.name : source.file.name,
      pages,
    }
  } finally {
    loadingTask.destroy()
  }
}

async function detectTextNativePdf(source: SelectedPdfSource) {
  const data = await loadPdfBytes(source)
  const { getDocument } = await import('pdfjs-dist/webpack.mjs')
  const loadingTask = getDocument({
    data,
    disableWorker: true,
    standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL,
  } as any)

  try {
    const pdfDocument = await loadingTask.promise
    const pagesToSample = Math.min(2, pdfDocument.numPages)

    for (let pageNumber = 1; pageNumber <= pagesToSample; pageNumber++) {
      const page = await pdfDocument.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const textItems = (textContent.items as Array<{ str?: string }>).filter((item) => normalizeText(String(item.str ?? '')).length > 0)

      if (textItems.length >= 8) {
        return true
      }

      const textLength = textItems.map((item) => normalizeText(String(item.str ?? ''))).join(' ').length
      if (textLength >= 80) {
        return true
      }
    }

    return false
  } finally {
    loadingTask.destroy()
  }
}

type ScribeProgressMessage = {
  n?: number
  type?: string
  info?: {
    status?: string
    engineName?: string
  }
}

let scribePromise: Promise<any> | null = null

async function getScribe() {
  if (!scribePromise) {
    scribePromise = import('scribe.js-ocr').then((module) => module.default)
  }
  return await scribePromise
}

function createProgressReporter(
  onProgress: ((progress: PdfConversionProgress) => void) | undefined,
  pageCount: number,
) {
  return (message: ScribeProgressMessage) => {
    if (!onProgress) return

    const pageNumber = typeof message.n === 'number' ? message.n + 1 : 1
    const totalPages = Math.max(1, pageCount)
    const pageRatio = Math.min(1, pageNumber / totalPages)
    const status = String(message.info?.status ?? '').toLowerCase()

    if (message.type === 'importPDF' || message.type === 'importImage') {
      onProgress({
        percent: 8 + Math.round(pageRatio * 12),
        label: 'Loading PDF',
        detail: `Importing page ${pageNumber} of ${totalPages}`,
      })
      return
    }

    if (message.type === 'recognize') {
      const detail = status.includes('sending')
        ? `Recognizing page ${pageNumber} of ${totalPages}`
        : status.includes('loading')
          ? `Preparing OCR for page ${pageNumber} of ${totalPages}`
          : `Processing page ${pageNumber} of ${totalPages}`

      onProgress({
        percent: 24 + Math.round(pageRatio * 54),
        label: 'Recognizing text',
        detail,
      })
      return
    }

    if (message.type === 'export') {
      onProgress({
        percent: 85 + Math.round(pageRatio * 10),
        label: 'Building output',
        detail: `Preparing file from page ${pageNumber} of ${totalPages}`,
      })
    }
  }
}

async function extractWithScribe(source: SelectedPdfSource, onProgress?: (progress: PdfConversionProgress) => void) {
  const scribe = await getScribe()
  const pdfFile = await loadPdfFile(source)
  const previousProgressHandler = scribe.opt.progressHandler
  const previousWarningHandler = scribe.opt.warningHandler
  const previousErrorHandler = scribe.opt.errorHandler

  try {
    onProgress?.({ percent: 5, label: 'Loading PDF' })
    await scribe.init({ pdf: true, ocr: true, font: true })

    scribe.opt.warningHandler = () => {}
    scribe.opt.errorHandler = () => {}

    onProgress?.({ percent: 14, label: 'Preparing document engine' })
    await scribe.importFiles([pdfFile])

    const pageCount = Number(scribe.inputData.pageCount ?? scribe.data?.ocr?.active?.length ?? 0)
    scribe.opt.progressHandler = createProgressReporter(onProgress, pageCount)
    onProgress?.({
      percent: 22,
      label: 'Analyzing document',
      detail: `${pageCount || 1} page${pageCount === 1 ? '' : 's'} detected`,
    })

    await scribe.recognize({ langs: ['eng'] })

    const activePages: Array<any> = Array.isArray(scribe.data?.ocr?.active) ? scribe.data.ocr.active : []
    const pages: ExtractedPdfPage[] = activePages.map((page, index) => {
      const pageNumber = Number(page?.n ?? index) + 1
      const pageText = scribe.utils.ocr.getPageText(page)
      const lines = pageText
        .split(/\r?\n/)
        .map((line: string) => normalizeText(line))
        .filter(Boolean)

      return {
        pageNumber,
        lines: lines.length > 0 ? lines : ['No extractable text found on this page.'],
      }
    })

    return {
      title: getSourceName(source),
      pages: pages.length > 0
        ? pages
        : [
            {
              pageNumber: 1,
              lines: ['No extractable text found on this PDF.'],
            },
          ],
    }
  } finally {
    scribe.opt.progressHandler = previousProgressHandler
    scribe.opt.warningHandler = previousWarningHandler
    scribe.opt.errorHandler = previousErrorHandler
    if (typeof scribe.clear === 'function') {
      scribe.clear()
    }
  }
}

async function buildWordBlob(source: SelectedPdfSource, onProgress?: (progress: PdfConversionProgress) => void) {
  const scribe = await getScribe()
  const pdfFile = await loadPdfFile(source)
  const previousProgressHandler = scribe.opt.progressHandler
  try {
    scribe.opt.progressHandler = createProgressReporter(onProgress, 1)
    onProgress?.({ percent: 5, label: 'Loading PDF' })
    const resultBytes = await scribe.extractText([pdfFile], ['eng'], 'docx')
    onProgress?.({ percent: 100, label: 'Conversion complete' })

    return {
      fileName: getOutputFileName(source, 'word'),
      blob: new Blob([resultBytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    }
  } finally {
    scribe.opt.progressHandler = previousProgressHandler
  }
}

async function buildExcelBlob(source: SelectedPdfSource, onProgress?: (progress: PdfConversionProgress) => void) {
  const scribe = await getScribe()
  const pdfFile = await loadPdfFile(source)
  const previousProgressHandler = scribe.opt.progressHandler
  try {
    scribe.opt.progressHandler = createProgressReporter(onProgress, 1)
    onProgress?.({ percent: 5, label: 'Loading PDF' })
    const resultBytes = await scribe.extractText([pdfFile], ['eng'], 'xlsx')
    onProgress?.({ percent: 100, label: 'Conversion complete' })

    return {
      fileName: getOutputFileName(source, 'excel'),
      blob: new Blob([resultBytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    }
  } finally {
    scribe.opt.progressHandler = previousProgressHandler
  }
}

async function buildPowerPointBlob(source: SelectedPdfSource, onProgress?: (progress: PdfConversionProgress) => void) {
  const PptxGenJSModule = await import('pptxgenjs')
  const PptxGenJS = PptxGenJSModule.default
  const extracted = await extractWithScribe(source, onProgress)
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

    slide.addText(page.lines.join('\n'), {
      x: 0.7,
      y: 1,
      w: 12,
      h: 5.7,
      fontFace: 'Aptos',
      fontSize: 12,
      color: '334155',
      margin: 0,
      valign: 'top',
    })
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

async function buildTextWordBlob(source: SelectedPdfSource, onProgress?: (progress: PdfConversionProgress) => void) {
  const { AlignmentType, Document, HeadingLevel, Paragraph, Packer, TextRun } = await import('docx')
  const extracted = await extractTextPdfPages(source, onProgress)
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

async function buildTextExcelBlob(source: SelectedPdfSource, onProgress?: (progress: PdfConversionProgress) => void) {
  const XLSX = await import('xlsx')
  const extracted = await extractTextPdfPages(source, onProgress)
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

async function buildTextPowerPointBlob(source: SelectedPdfSource, onProgress?: (progress: PdfConversionProgress) => void) {
  const PptxGenJSModule = await import('pptxgenjs')
  const PptxGenJS = PptxGenJSModule.default
  const extracted = await extractTextPdfPages(source, onProgress)
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

    slide.addText(page.lines.join('\n'), {
      x: 0.7,
      y: 1,
      w: 12,
      h: 5.7,
      fontFace: 'Aptos',
      fontSize: 12,
      color: '334155',
      margin: 0,
      valign: 'top',
    })
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

async function convertWithLegacyEngine(
  source: SelectedPdfSource,
  target: PdfConversionTarget,
  onProgress?: (progress: PdfConversionProgress) => void,
) {
  const legacyModule = await import('./pdf-converter')
  return await legacyModule.convertPdfSource(source, target, onProgress)
}

export async function convertPdfSource(
  source: SelectedPdfSource,
  target: PdfConversionTarget,
  onProgress?: (progress: PdfConversionProgress) => void,
): Promise<PdfConversionResult> {
  onProgress?.({ percent: 0, label: 'Starting conversion' })

  try {
    return await convertWithServerEngine(source, target, onProgress)
  } catch (error) {
    onProgress?.({
      percent: 35,
      label: 'Primary engine unavailable',
      detail: 'Falling back to the legacy PDF converter.',
    })
    const textNative = await detectTextNativePdf(source)
    try {
      if (textNative) {
        onProgress?.({
          percent: 42,
          label: 'Text PDF detected',
          detail: 'Using the local text conversion pipeline.',
        })
        if (target === 'excel') return await buildTextExcelBlob(source, onProgress)
        if (target === 'word') return await buildTextWordBlob(source, onProgress)
        return await buildTextPowerPointBlob(source, onProgress)
      }

      if (target === 'excel') return await buildExcelBlob(source, onProgress)
      if (target === 'word') return await buildWordBlob(source, onProgress)
      return await buildPowerPointBlob(source, onProgress)
    } catch {
      return await convertWithLegacyEngine(source, target, onProgress)
    }
  }
}
