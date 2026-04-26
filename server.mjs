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

/**
 * Proxy d'images cross-origin. Beaucoup de CDN e-commerce (Brico Dépôt,
 * Castorama, etc.) ne renvoient pas d'en-têtes CORS, ce qui empêche
 * `crossOrigin: 'anonymous'` côté Fabric.js de charger l'image sans tainter
 * le canvas (et donc bloquer l'export). Ce proxy refetch côté serveur et
 * relaie avec un Access-Control-Allow-Origin permissif.
 */
app.get('/api/image-proxy', async (req, res) => {
  const targetUrl = typeof req.query.url === 'string' ? req.query.url : ''
  if (!targetUrl) {
    res.status(400).send('Missing url query param')
    return
  }
  let parsed
  try {
    parsed = new URL(targetUrl)
  } catch {
    res.status(400).send('Invalid URL')
    return
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.status(400).send('Only http(s) URLs are allowed')
    return
  }
  // Sécurité minimale anti-SSRF : blocage des hôtes locaux/privés
  const host = parsed.hostname
  if (host === 'localhost' || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host === '0.0.0.0') {
    res.status(403).send('Local addresses not allowed')
    return
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        // Certains CDN refusent les User-Agent non-navigateur
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
      },
    })
    if (!upstream.ok) {
      res.status(upstream.status).send(`Upstream ${upstream.status}`)
      return
    }
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    if (!contentType.startsWith('image/')) {
      res.status(415).send(`Unsupported content-type: ${contentType}`)
      return
    }
    const buffer = Buffer.from(await upstream.arrayBuffer())
    res.set('Content-Type', contentType)
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(buffer)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('❌ Image proxy error:', msg)
    res.status(502).send(`Proxy error: ${msg}`)
  }
})

app.listen(PORT, () => {
  console.log(`✅ Claude Vision + image proxy listening on http://localhost:${PORT}`)
})
