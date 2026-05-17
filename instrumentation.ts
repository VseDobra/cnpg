export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const cron = await import('node-cron')
    const { runSync } = await import('./lib/sync')
    const { runDailyScan } = await import('./lib/naver/research')

    cron.schedule('0 * * * *', () => {
      runSync()
    })

    cron.schedule('0 7 * * *', () => {
      runDailyScan()
    })

    console.log('[cron] Hourly sync + daily discover scheduler started')
  }
}
