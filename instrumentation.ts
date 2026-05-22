export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const cron = await import('node-cron')
    const { runSync } = await import('./lib/sync')
    const { runDailyScan } = await import('./lib/naver/research')
    const { scanForReruns } = await import('./lib/explorer/rerun-scan')

    cron.schedule('0 * * * *', () => {
      runSync()
    })

    cron.schedule('0 7 * * *', () => {
      runDailyScan()
    })

    // Weekly rerun scan: понедельник 08:00 KST
    cron.schedule('0 8 * * 1', () => {
      scanForReruns().catch((e) => console.error('[rerun-scan] cron failed:', e))
    })

    console.log('[cron] Hourly sync + daily discover + weekly rerun scheduler started')
  }
}
