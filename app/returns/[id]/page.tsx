'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface ReturnItem {
  vendorItemId: number
  vendorItemName: string
  cancelCount: number
  purchaseCount: number
  sellerProductName: string
  releaseStatus: string
}

interface ReturnDelivery {
  deliveryCompanyCode: string
  deliveryInvoiceNo: string
}

interface ReturnDetail {
  receiptId: number
  orderId: number
  receiptStatus: string
  createdAt: string
  modifiedAt: string
  requesterName: string
  requesterPhoneNumber: string
  requesterAddress: string
  requesterAddressDetail: string
  requesterZipCode: string
  cancelReasonCategory1: string
  cancelReasonCategory2: string
  cancelReason: string
  cancelCountSum: number
  returnDeliveryType: string
  faultByType: string
  preRefund: boolean
  completeConfirmType: string
  completeConfirmDate: string
  reasonCodeText: string
  returnShippingCharge: { units: number; nanos: number }
  returnItems: ReturnItem[]
  returnDeliveryDtos: ReturnDelivery[]
}

const STATUS: Record<string, string> = {
  RELEASE_STOP_UNCHECKED: 'Запрос остановки отгрузки',
  RETURNS_UNCHECKED: 'Заявка на возврат',
  VENDOR_WAREHOUSE_CONFIRM: 'Товар получен на склад',
  REQUEST_COUPANG_CHECK: 'Передано на проверку Coupang',
  RETURNS_COMPLETED: 'Возврат завершён',
}

const STATUS_COLORS: Record<string, string> = {
  RELEASE_STOP_UNCHECKED: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  RETURNS_UNCHECKED: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  VENDOR_WAREHOUSE_CONFIRM: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  REQUEST_COUPANG_CHECK: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  RETURNS_COMPLETED: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
}

const FAULT: Record<string, string> = {
  COUPANG: 'Вина Coupang',
  VENDOR: 'Вина продавца',
  CUSTOMER: 'Вина покупателя',
  WMS: 'Вина логистики',
  GENERAL: 'Общая',
}

const FAULT_COLORS: Record<string, string> = {
  COUPANG: 'text-orange-400',
  VENDOR: 'text-red-400',
  CUSTOMER: 'text-[#9ca3af]',
  WMS: 'text-yellow-400',
  GENERAL: 'text-[#9ca3af]',
}

const CONFIRM: Record<string, string> = {
  VENDOR_CONFIRM: 'Подтверждено продавцом',
  UNDEFINED: 'Не проверено',
  CS_CONFIRM: 'Проверено CS',
  CS_LOSS_CONFIRM: 'CS: потеря',
}

const RELEASE: Record<string, string> = {
  Y: 'Отправлен',
  N: 'Не отправлен',
  S: 'Доставка остановлена',
  A: 'Уже отправлен',
}

function fmt(s: string) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ReturnDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [ret, setRet] = useState<ReturnDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/returns/${id}`)
      .then(r => { if (!r.ok) throw new Error('Не найдено'); return r.json() })
      .then(d => { setRet(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [id])

  if (loading) return <div className="flex items-center justify-center h-48 text-[#6b7280] text-sm">Загрузка...</div>
  if (!ret) return <div className="flex items-center justify-center h-48 text-red-400 text-sm">{error ?? 'Ошибка'}</div>

  const statusLabel = STATUS[ret.receiptStatus] ?? ret.receiptStatus
  const statusColor = STATUS_COLORS[ret.receiptStatus] ?? 'text-[#9ca3af] bg-[#9ca3af]/10 border-[#9ca3af]/20'
  const shippingCharge = ret.returnShippingCharge?.units ?? 0

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/returns')} className="text-[#6b7280] hover:text-white text-sm transition-colors">← Назад</button>
          <span className="text-[#2d3148]">/</span>
          <div>
            <p className="text-xs text-[#6b7280] mb-0.5">Возврат</p>
            <h1 className="text-base font-semibold font-mono">#{ret.receiptId}</h1>
          </div>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full border ${statusColor}`}>{statusLabel}</span>
      </div>

      <div className="space-y-4">
        {/* Meta */}
        <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148] grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-1">Заказ</p>
            <p className="text-sm text-white font-mono">#{ret.orderId}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-1">Дата заявки</p>
            <p className="text-sm text-white">{fmt(ret.createdAt)}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-1">Ответственность</p>
            <p className={`text-sm font-medium ${FAULT_COLORS[ret.faultByType] ?? 'text-[#9ca3af]'}`}>
              {FAULT[ret.faultByType] ?? ret.faultByType}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-1">Проверка</p>
            <p className="text-sm text-[#9ca3af]">{CONFIRM[ret.completeConfirmType] ?? ret.completeConfirmType}</p>
          </div>
          {shippingCharge !== 0 && (
            <div>
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-1">Стоимость доставки возврата</p>
              <p className={`text-sm font-medium ${shippingCharge > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {shippingCharge > 0 ? `+₩${shippingCharge.toLocaleString()} (платит продавец)` : `₩${Math.abs(shippingCharge).toLocaleString()} (платит покупатель)`}
              </p>
            </div>
          )}
          {ret.preRefund && (
            <div>
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-1">Быстрый возврат</p>
              <p className="text-sm text-yellow-400">Да</p>
            </div>
          )}
        </div>

        {/* Reason */}
        <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
          <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-3">Причина возврата</p>
          {ret.cancelReasonCategory1 && (
            <p className="text-xs text-[#6b7280] mb-1">{ret.cancelReasonCategory1}{ret.cancelReasonCategory2 ? ` → ${ret.cancelReasonCategory2}` : ''}</p>
          )}
          {ret.reasonCodeText && <p className="text-sm text-[#9ca3af] mb-1">{ret.reasonCodeText}</p>}
          {ret.cancelReason && <p className="text-sm text-white">{ret.cancelReason}</p>}
        </div>

        {/* Requester */}
        {(ret.requesterName || ret.requesterAddress) && (
          <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-3">Покупатель</p>
            {ret.requesterName && <p className="text-sm text-white font-medium mb-1">{ret.requesterName}</p>}
            {ret.requesterPhoneNumber && <p className="text-xs text-[#6b7280] mb-2">{ret.requesterPhoneNumber}</p>}
            {ret.requesterAddress && (
              <p className="text-sm text-[#9ca3af]">
                {ret.requesterAddress}{ret.requesterAddressDetail ? `, ${ret.requesterAddressDetail}` : ''}
                {ret.requesterZipCode ? ` (${ret.requesterZipCode})` : ''}
              </p>
            )}
          </div>
        )}

        {/* Items */}
        {ret.returnItems?.length > 0 && (
          <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-4">Товары к возврату</p>
            <div className="space-y-3">
              {ret.returnItems.map((item, i) => (
                <div key={i} className="flex items-start justify-between gap-4 pb-3 border-b border-[#1e2233] last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white leading-snug mb-1">{item.vendorItemName || item.sellerProductName}</p>
                    <p className="text-xs text-[#4b5563]">ID: {item.vendorItemId}</p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="text-sm text-white">{item.cancelCount} из {item.purchaseCount} шт.</p>
                    <p className={`text-xs ${item.releaseStatus === 'S' ? 'text-yellow-400' : item.releaseStatus === 'Y' ? 'text-emerald-400' : 'text-[#6b7280]'}`}>
                      {RELEASE[item.releaseStatus] ?? item.releaseStatus}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delivery */}
        {ret.returnDeliveryDtos?.filter(d => d.deliveryInvoiceNo).length > 0 && (
          <div className="bg-[#1a1d2e] rounded-xl p-5 border border-[#2d3148]">
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-3">Возвратная доставка</p>
            <p className="text-xs text-[#6b7280] mb-3">{ret.returnDeliveryType}</p>
            {ret.returnDeliveryDtos.filter(d => d.deliveryInvoiceNo).map((d, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <span className="text-xs text-[#6b7280]">{d.deliveryCompanyCode}</span>
                <span className="text-xs text-white font-mono">{d.deliveryInvoiceNo}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
