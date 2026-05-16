export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const cron = await import('node-cron')
    const { runSync } = await import('./lib/sync')

    cron.schedule('0 * * * *', () => {
      runSync()
    })

    console.log('[cron] Hourly sync scheduler started')
  }
}
