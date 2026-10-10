import QRCode from 'qrcode'

export function generateQrMatrix(text: string): boolean[][] {
  const { modules } = QRCode.create(text)
  return Array.from({ length: modules.size }, (_, row) =>
    Array.from({ length: modules.size }, (_, column) => Boolean(modules.get(row, column))),
  )
}
