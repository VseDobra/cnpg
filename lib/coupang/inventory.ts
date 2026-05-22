import { coupangRequest } from './client'

const VENDOR_ID = process.env.COUPANG_VENDOR_ID!

export interface RgInventorySummary {
  vendorItemId: number
  vendorId: string
  externalSkuId: number
  inventoryDetails: { totalOrderableQuantity: number }
  salesCountMap: { SALES_COUNT_LAST_THIRTY_DAYS: number }
}

export async function fetchRgInventory(): Promise<RgInventorySummary[]> {
  const results: RgInventorySummary[] = []
  let nextToken: string | null = null

  do {
    const query: string = nextToken ? `?nextToken=${nextToken}` : ''
    const path: string = `/v2/providers/rg_open_api/apis/api/v1/vendors/${VENDOR_ID}/rg/inventory/summaries${query}`
    const res = await coupangRequest<{ data: RgInventorySummary[]; nextToken: string | null }>('GET', path)
    results.push(...(res.data ?? []))
    nextToken = res.nextToken ?? null
  } while (nextToken)

  return results
}
