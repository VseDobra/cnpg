import { coupangRequest } from './client'

export interface CategoryNode {
  displayCategoryCode?: number
  displayItemCategoryCode?: number
  name: string
  status: string
  child: CategoryNode[]
}

export interface FlatCategory {
  code: number
  name: string
  path: string[]
  pathStr: string
}

export interface CategoryAttribute {
  attributeTypeName: string
  required: string
  dataType: string
  basicUnit: string
  exposed: string
  groupNumber: string
  usableUnits: string[]
}

export interface NoticeDetail {
  noticeCategoryDetailName: string
  required: string
}

export interface NoticeCategory {
  noticeCategoryName: string
  noticeCategoryDetailNames: NoticeDetail[]
}

export interface RequiredDocument {
  templateName: string
  required: string
}

export interface Certification {
  certificationType: string
  name: string
  dataType: string
  required: string
}

export interface CategoryMeta {
  isAllowSingleItem: boolean
  attributes: CategoryAttribute[]
  noticeCategories: NoticeCategory[]
  requiredDocumentNames: RequiredDocument[]
  certifications: Certification[]
  allowedOfferConditions: string[]
  isExpirationDateRequiredForRocketGrowth: boolean
}

export async function fetchCategoryTree(): Promise<CategoryNode> {
  const res = await coupangRequest<{ data: CategoryNode }>(
    'GET',
    '/v2/providers/seller_api/apis/api/v1/marketplace/meta/display-categories?registrationType=RFM'
  )
  return res.data
}

function getCode(node: CategoryNode): number {
  return node.displayCategoryCode ?? node.displayItemCategoryCode ?? 0
}

function flattenNode(node: CategoryNode, path: string[]): FlatCategory[] {
  if (node.status !== 'ACTIVE') return []
  const isRoot = node.name === 'ROOT'
  const currentPath = isRoot ? [] : [...path, node.name]
  const results: FlatCategory[] = []

  if (node.child && node.child.length > 0) {
    for (const child of node.child) {
      results.push(...flattenNode(child, currentPath))
    }
  }

  const code = getCode(node)
  if (!isRoot && code && currentPath.length > 0) {
    results.push({
      code,
      name: node.name,
      path: currentPath,
      pathStr: currentPath.join(' › '),
    })
  }

  return results
}

export function flattenCategories(root: CategoryNode): FlatCategory[] {
  return flattenNode(root, [])
}

export interface CategoryRecommendation {
  predictedCategoryId: string
  predictedCategoryName: string
  autoCategorizationPredictionResultType: string
  comment: string | null
}

export async function fetchCategoryRecommendation(
  productName: string,
  brand?: string
): Promise<CategoryRecommendation> {
  const res = await coupangRequest<{ data: CategoryRecommendation }>(
    'POST',
    '/v2/providers/openapi/apis/api/v1/categorization/predict',
    { productName, ...(brand ? { brand } : {}) }
  )
  return res.data
}

export async function fetchCategoryMeta(code: number): Promise<CategoryMeta> {
  const res = await coupangRequest<{ data: CategoryMeta }>(
    'GET',
    `/v2/providers/seller_api/apis/api/v1/marketplace/meta/category-related-metas/display-category-codes/${code}`
  )
  return res.data
}

export async function checkAutoCategorizationAgreement(): Promise<boolean> {
  const vendorId = process.env.COUPANG_VENDOR_ID!
  const res = await coupangRequest<{ code: string; data: boolean }>(
    'GET',
    `/v2/providers/seller_api/apis/api/v1/marketplace/vendors/${vendorId}/check-auto-category-agreed`
  )
  return res.data
}
