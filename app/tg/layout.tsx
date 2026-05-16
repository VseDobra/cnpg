export default function TgLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0f1117] text-[#e2e8f0] min-h-screen p-4">
      {children}
    </div>
  )
}
