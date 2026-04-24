import express from 'express'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '.env.local') })

const app = express()
app.use(express.json({ limit: '50mb' }))

app.post('/api/claude-vision', async (req, res) => {
  try {
    const apiKey = process.env.VITE_ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('[API] Missing ANTHROPIC_API_KEY')
      return res.status(400).json({ error: 'API key not configured' })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[API] Error:', response.status, text.slice(0, 200))
      return res.status(response.status).send(text)
    }

    res.json(await response.json())
  } catch (err) {
    console.error('[API] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.listen(3000, () => {
  console.log('[API Server] Listening on http://localhost:3000')
})
