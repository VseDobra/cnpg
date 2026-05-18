// @ts-ignore — no types for google-trends-api
import googleTrends from 'google-trends-api'

export interface GoogleTrendPoint {
  period: string
  ratio: number
}

export async function fetchGoogleTrends(
  keywords: string[],
  startDate: string,
  endDate: string,
  geo = 'KR',
): Promise<Array<{ title: string; data: GoogleTrendPoint[] }>> {
  if (keywords.length === 0) return []

  const results: Array<{ title: string; data: GoogleTrendPoint[] }> = []

  for (const keyword of keywords) {
    try {
      const raw = await googleTrends.interestOverTime({
        keyword,
        startTime: new Date(startDate),
        endTime: new Date(endDate),
        geo,
      })
      const parsed = JSON.parse(raw)
      const timelineData: Array<{ formattedTime: string; formattedAxisTime: string; value: number[] }> =
        parsed?.default?.timelineData ?? []

      results.push({
        title: keyword,
        data: timelineData
          .filter(p => p.hasData?.[0])
          .map(p => ({
            period: new Date(Number(p.time) * 1000).toISOString().slice(0, 10),
            ratio: p.value?.[0] ?? 0,
          })),
      })
    } catch {
      results.push({ title: keyword, data: [] })
    }
  }

  return results
}
