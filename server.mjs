import express from 'express'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const app = express()
const PORT = 3000

app.use(express.json({ limit: '50mb' }))

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

/**
 * Proxy pour les appels Claude Vision depuis le frontend
 * Relaye vers l'API Anthropic avec la clé API serveur
 */
app.post('/api/claude-vision', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not set')
    res.status(500).json({ error: 'API key not configured' })
    return
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Anthropic API error: ${response.status}`, errorText)
      res.status(response.status).send(errorText)
      return
    }

    const data = await response.json()
    res.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('❌ Claude Vision proxy error:', msg)
    res.status(500).json({ error: msg })
  }
})

app.listen(PORT, () => {
  console.log(`✅ Claude Vision proxy listening on http://localhost:${PORT}`)
})
