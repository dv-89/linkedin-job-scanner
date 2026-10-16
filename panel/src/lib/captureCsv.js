import { CSV_COLUMNS, csvRow, jobIdentity } from './jobCapture.js'

// CSV cells can contain commas, quotes and multiple lines.
export function parseCaptureCsv(text) {
  if (!text.trim()) return []
  text = text.replace(/^\uFEFF/, '')
  const rows = []
  let row = [], cell = '', quoted = false, closed = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++ }
      else if (char === '"') { quoted = false; closed = true }
      else cell += char
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell)
      cell = ''; closed = false
      if (char !== ',') {
        if (char === '\r' && text[index + 1] === '\n') index++
        if (row.some(Boolean)) rows.push(row)
        row = []
      }
    } else if (char === '"' && !cell && !closed) quoted = true
    else {
      if (closed || char === '"') throw new Error('The selected CSV has invalid quoting. Choose a Job Scanner CSV or create a new file.')
      cell += char
    }
  }
  if (quoted) throw new Error('The selected CSV has an unfinished quoted cell. Its contents have not been changed.')
  row.push(cell)
  if (row.some(Boolean)) rows.push(row)
  if (rows.length) {
    const header = rows[0]
    if (!header.includes('Job URL') || !header.includes('Title') || new Set(header).size !== header.length ||
        rows.slice(1).some((item) => item.length !== header.length)) {
      throw new Error('Choose an existing Job Scanner CSV, or create a new CSV. This file has not been changed.')
    }
  }
  return rows
}

export function mergeCaptureCsv(text, records, { updateExisting = true } = {}) {
  const rows = parseCaptureCsv(text)
  const oldHeader = rows[0] || []
  const header = CSV_COLUMNS.map(([, name]) => name)
  // Migrate older files to the selected columns while keeping every job row.
  const sourceIndices = header.map((name) => oldHeader.indexOf(name))
  const data = rows.slice(1).map((row) => sourceIndices.map((index) => row[index] ?? ''))
  const previousUpdates = rows.slice(1).map((row) => row[oldHeader.indexOf('Last updated (UTC)')])
  const urlIndex = header.indexOf('Job URL')
  const applyIndex = header.indexOf('Apply clicked (UTC)')
  const byId = new Map()
  data.forEach((row, index) => {
    const id = jobIdentity({ url: row[urlIndex] })
    if (id && !byId.has(id)) byId.set(id, index)
  })
  for (const record of records) {
    const index = byId.get(record.id)
    if (index !== undefined && !updateExisting) continue
    const previous = index === undefined ? null : data[index]
    if (previous && Date.parse(previousUpdates[index]) > Date.parse(record.updatedAt)) continue
    const next = previous ? [...previous] : Array(header.length).fill('')
    for (const [key, name] of CSV_COLUMNS) next[header.indexOf(name)] = String(record[key] ?? '')
    if (previous) {
      next[applyIndex] = next[applyIndex] || previous[applyIndex]
      data[index] = next
    } else {
      byId.set(record.id, data.length)
      data.push(next)
    }
  }
  return '\uFEFF' + [header, ...data].map(csvRow).join('\r\n') + '\r\n'
}
