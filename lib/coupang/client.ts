import crypto from 'crypto'

const BASE_URL = 'https://api-gateway.coupang.com'

function generateSignature(method: string, path: string, datetime: string, secretKey: string): string {
  // Coupang HMAC: path and query are split — '?' is excluded from the signed message
  const [urlPath, query = ''] = path.split('?')
  const message = datetime + method + urlPath + query
  return crypto.createHmac('sha256', secretKey).update(message).digest('hex')
}

function getDatetime(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const yy = String(now.getUTCFullYear()).slice(2)
  const MM = pad(now.getUTCMonth() + 1)
  const dd = pad(now.getUTCDate())
  const HH = pad(now.getUTCHours())
  const mm = pad(now.getUTCMinutes())
  const ss = pad(now.getUTCSeconds())
  return `${yy}${MM}${dd}T${HH}${mm}${ss}Z`
}

export async function coupangRequest<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const accessKey = process.env.COUPANG_ACCESS_KEY!
  const secretKey = process.env.COUPANG_SECRET_KEY!
  const datetime = getDatetime()
  const signature = generateSignature(method, path, datetime, secretKey)

  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Coupang API error ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}
