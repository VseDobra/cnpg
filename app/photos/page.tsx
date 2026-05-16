'use client'
import { useEffect, useRef, useState } from 'react'

interface Product {
  id: string
  name: string
  imageUrl: string | null
}

export default function PhotosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(setProducts)
  }, [])

  async function upload(productId: string, file: File) {
    setUploading(productId)
    setMessage(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/products/${productId}/image`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Ошибка')
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, imageUrl: data.imageUrl } : p))
      setMessage({ id: productId, text: 'Фото сохранено', ok: true })
    } catch (e) {
      setMessage({ id: productId, text: e instanceof Error ? e.message : 'Ошибка', ok: false })
    } finally {
      setUploading(null)
    }
  }

  async function remove(productId: string) {
    setUploading(productId)
    try {
      await fetch(`/api/products/${productId}/image`, { method: 'DELETE' })
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, imageUrl: null } : p))
      setMessage({ id: productId, text: 'Фото удалено', ok: true })
    } finally {
      setUploading(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold mb-2">Фото товаров</h1>
      <p className="text-xs text-[#6b7280] mb-6">Загрузи фото с компьютера — они будут отображаться напротив каждого заказа</p>

      <div className="space-y-3">
        {products.map(p => (
          <div key={p.id} className="bg-[#1a1d2e] rounded-xl border border-[#2d3148] p-4 flex items-center gap-4">
            {/* Preview */}
            <div
              className="w-20 h-20 rounded-xl bg-[#12141f] border border-[#2d3148] flex-shrink-0 overflow-hidden flex items-center justify-center cursor-pointer group relative"
              onClick={() => !uploading && inputRefs.current[p.id]?.click()}
            >
              {p.imageUrl ? (
                <>
                  <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white">
                    Заменить
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1 text-[#4b5563] group-hover:text-[#6366f1] transition-colors">
                  <span className="text-2xl">+</span>
                  <span className="text-[10px]">Загрузить</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug mb-1 line-clamp-2">{p.name}</p>
              <p className="text-[10px] text-[#4b5563] font-mono mb-2">ID: {p.id}</p>

              {message?.id === p.id && (
                <p className={`text-xs mb-2 ${message.ok ? 'text-green-400' : 'text-red-400'}`}>{message.text}</p>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => inputRefs.current[p.id]?.click()}
                  disabled={uploading === p.id}
                  className="text-xs bg-[#6366f1] hover:bg-[#5457e0] disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  {uploading === p.id ? 'Загрузка...' : p.imageUrl ? 'Заменить фото' : 'Загрузить фото'}
                </button>
                {p.imageUrl && (
                  <button
                    onClick={() => remove(p.id)}
                    disabled={uploading === p.id}
                    className="text-xs text-[#6b7280] hover:text-red-400 transition-colors"
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>

            <input
              ref={el => { inputRefs.current[p.id] = el }}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) upload(p.id, file)
                e.target.value = ''
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
