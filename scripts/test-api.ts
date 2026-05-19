async function main() {
  const res = await fetch('http://localhost:3000/api/scrape/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyword: '훌라후프',
      limit: 3,
      sheetId: 'test',
      sheetName: 'test',
    }),
  })
  console.log('Status:', res.status)
  if (!res.body) return
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    process.stdout.write(dec.decode(value))
  }
}
main().catch(e => { console.error(e); process.exit(1) })
