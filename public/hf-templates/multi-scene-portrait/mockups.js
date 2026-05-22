/* eslint-disable */
/**
 * Mockups SVG pour les scènes 'visual' des templates multi-scene HyperFrames.
 *
 * Chaque fonction renvoie un fragment SVG inline (NamespaceURI implicite — sera
 * inséré dans un <svg> parent par buildMockupSvg). Les éléments portent des
 * classes pour pouvoir être ciblés par GSAP depuis le template :
 *   .mockup-stroke    → tracés à dessiner (stroke-dashoffset → 0)
 *   .mockup-bar       → barres à grandir (scaleY 0 → 1, transform-origin bottom)
 *   .mockup-pop       → éléments à apparaître en pop (scale 0.8 → 1, opacity)
 *   .mockup-number    → chiffres à monter
 *   .mockup-card      → cards à apparaître avec stagger
 *
 * Le template applique une opacité globale faible (≈0.22) au container du
 * mockup pour qu'il reste un fond, pas un focus.
 */
;(function (root) {
  function rect(x, y, w, h, attrs) {
    var a = attrs || ''
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" ' + a + '/>'
  }
  function line(x1, y1, x2, y2, attrs) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" ' + (attrs || '') + '/>'
  }
  function circle(cx, cy, r, attrs) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" ' + (attrs || '') + '/>'
  }
  function path(d, attrs) {
    return '<path d="' + d + '" ' + (attrs || '') + '/>'
  }
  function text(x, y, content, attrs) {
    return '<text x="' + x + '" y="' + y + '" ' + (attrs || '') + '>' + content + '</text>'
  }

  function dashboard(W, H, accent) {
    var stroke = accent || '#ffffff'
    var fillSoft = stroke + '22'
    var fillVery = stroke + '14'
    var green = '#4ade80'  // up/positif
    var red = '#f87171'    // down/négatif
    var headerH = Math.round(H * 0.06)
    var sideW = Math.round(W * 0.14)
    var pad = Math.round(W * 0.018)
    var out = ''

    // Cadre extérieur
    out += rect(8, 8, W - 16, H - 16, 'rx="14" fill="' + fillVery + '" stroke="' + stroke + '" stroke-width="1.5" stroke-opacity="0.35"/')

    // Header bar avec ticker boursier
    out += rect(16, 16, W - 32, headerH, 'fill="' + fillSoft + '" rx="10"/')
    out += circle(40, 16 + headerH / 2, 6, 'fill="' + green + '" opacity="0.95"/')
    out += rect(56, 16 + headerH / 2 - 4, 90, 8, 'rx="2" fill="' + stroke + '" opacity="0.7"/')
    // Tickers fictifs
    var tickerLabels = ['CAC40', 'EURUSD', 'BTC', 'GOLD']
    var tickerColors = [green, red, green, green]
    void tickerLabels
    for (var t = 0; t < 4; t++) {
      var tx = 180 + t * 130
      out += rect(tx, 16 + headerH / 2 - 6, 50, 12, 'rx="2" fill="' + stroke + '" opacity="0.45"/')
      out += rect(tx + 56, 16 + headerH / 2 - 6, 40, 12, 'rx="2" fill="' + tickerColors[t] + '" opacity="0.85"/')
    }
    out += rect(W - 100, 16 + headerH / 2 - 8, 70, 16, 'rx="8" fill="' + stroke + '" opacity="0.18"/')

    // Sidebar avec menu
    var sideY = 16 + headerH + pad
    var sideH = H - sideY - 16
    out += rect(16, sideY, sideW, sideH, 'fill="' + fillSoft + '" rx="10"/')
    for (var i = 0; i < 7; i++) {
      var iy = sideY + 30 + i * 50
      out += rect(36, iy, sideW - 48, 10, 'rx="2" fill="' + stroke + '" opacity="' + (i === 1 ? '0.95' : '0.32') + '"/')
      if (i === 1) out += rect(20, iy - 6, 4, 22, 'rx="2" fill="' + stroke + '"/')
      out += circle(28, iy + 5, 4, 'fill="' + stroke + '" opacity="' + (i === 1 ? '0.95' : '0.3') + '"/')
    }

    // Zone principale : split en grille 2×2
    var mainX = 16 + sideW + pad
    var mainY = sideY
    var mainW = W - mainX - 16
    var mainH = sideH

    var gridGap = pad
    var bigChartW = Math.round(mainW * 0.62)
    var bigChartH = Math.round(mainH * 0.55)
    var smallChartW = mainW - bigChartW - gridGap
    var smallChartH = bigChartH

    // ─── Big line chart (cours principal avec aire) ─────────────────────────
    out += rect(mainX, mainY, bigChartW, bigChartH, 'class="mockup-card" rx="10" fill="' + fillSoft + '"/')
    out += rect(mainX + 20, mainY + 18, 140, 12, 'rx="3" fill="' + stroke + '" opacity="0.55"/')
    out += rect(mainX + 20, mainY + 38, 90, 22, 'rx="3" fill="' + stroke + '" opacity="0.95"/')
    out += rect(mainX + 120, mainY + 44, 40, 12, 'rx="2" fill="' + green + '" opacity="0.85"/')

    var chartInnerX = mainX + 30
    var chartInnerY = mainY + 80
    var chartInnerW = bigChartW - 60
    var chartInnerH = bigChartH - 110
    // Grid horizontal
    for (var g = 0; g < 5; g++) {
      var gy = chartInnerY + (chartInnerH / 4) * g
      out += line(chartInnerX, gy, chartInnerX + chartInnerW, gy, 'stroke="' + stroke + '" stroke-opacity="0.10" stroke-dasharray="3 5"/')
    }
    // Courbe principale + aire
    var n = 24
    var dx = chartInnerW / (n - 1)
    var bigPts = []
    var seedBig = [0.65, 0.6, 0.7, 0.55, 0.5, 0.62, 0.45, 0.52, 0.38, 0.42, 0.3, 0.35, 0.28, 0.22, 0.32, 0.18, 0.25, 0.15, 0.2, 0.12, 0.15, 0.08, 0.12, 0.05]
    for (var k = 0; k < n; k++) {
      var px = chartInnerX + k * dx
      var py = chartInnerY + chartInnerH * seedBig[k]
      bigPts.push((k === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1))
    }
    var bigPath = bigPts.join(' ')
    var areaPath = bigPath + ' L' + (chartInnerX + chartInnerW).toFixed(1) + ' ' + (chartInnerY + chartInnerH).toFixed(1) + ' L' + chartInnerX.toFixed(1) + ' ' + (chartInnerY + chartInnerH).toFixed(1) + ' Z'
    out += path(areaPath, 'fill="' + green + '" opacity="0.18"/')
    out += path(bigPath, 'class="mockup-stroke" fill="none" stroke="' + green + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/')
    // Points clés
    for (var p = 0; p < n; p += 4) {
      out += circle(chartInnerX + p * dx, chartInnerY + chartInnerH * seedBig[p], 4, 'class="mockup-pop" fill="' + green + '"/')
    }

    // ─── Pie chart / Donut (camembert) en haut à droite ─────────────────────
    var pieX = mainX + bigChartW + gridGap
    var pieY = mainY
    out += rect(pieX, pieY, smallChartW, smallChartH, 'class="mockup-card" rx="10" fill="' + fillSoft + '"/')
    out += rect(pieX + 20, pieY + 18, 120, 12, 'rx="3" fill="' + stroke + '" opacity="0.55"/')
    var pieCx = pieX + smallChartW / 2
    var pieCy = pieY + smallChartH / 2 + 10
    var pieR = Math.min(smallChartW, smallChartH) * 0.28
    var pieInnerR = pieR * 0.55
    // 4 segments
    var segments = [
      { value: 0.42, color: green, opacity: 0.85 },
      { value: 0.28, color: stroke, opacity: 0.65 },
      { value: 0.18, color: red, opacity: 0.85 },
      { value: 0.12, color: stroke, opacity: 0.35 },
    ]
    var startAngle = -Math.PI / 2
    for (var s = 0; s < segments.length; s++) {
      var seg = segments[s]
      var endAngle = startAngle + seg.value * 2 * Math.PI
      var largeArc = seg.value > 0.5 ? 1 : 0
      var x1 = pieCx + pieR * Math.cos(startAngle)
      var y1 = pieCy + pieR * Math.sin(startAngle)
      var x2 = pieCx + pieR * Math.cos(endAngle)
      var y2 = pieCy + pieR * Math.sin(endAngle)
      var ix1 = pieCx + pieInnerR * Math.cos(endAngle)
      var iy1 = pieCy + pieInnerR * Math.sin(endAngle)
      var ix2 = pieCx + pieInnerR * Math.cos(startAngle)
      var iy2 = pieCy + pieInnerR * Math.sin(startAngle)
      var segPath =
        'M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
        ' A ' + pieR + ' ' + pieR + ' 0 ' + largeArc + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) +
        ' L ' + ix1.toFixed(1) + ' ' + iy1.toFixed(1) +
        ' A ' + pieInnerR + ' ' + pieInnerR + ' 0 ' + largeArc + ' 0 ' + ix2.toFixed(1) + ' ' + iy2.toFixed(1) +
        ' Z'
      out += path(segPath, 'class="mockup-pop" fill="' + seg.color + '" opacity="' + seg.opacity + '"/')
      startAngle = endAngle
    }
    // Légende donut au centre
    out += text(pieCx, pieCy - 4, '42%', 'text-anchor="middle" font-size="' + (pieInnerR * 0.6) + '" font-weight="800" fill="' + stroke + '" opacity="0.95"/')

    // ─── Bottom row : 3 mini widgets : bars, sparkline, candlesticks ──────
    var widgetsY = mainY + bigChartH + gridGap
    var widgetH = mainH - bigChartH - gridGap
    var widgetW = (mainW - gridGap * 2) / 3

    // Widget 1 : barres (volumes)
    out += rect(mainX, widgetsY, widgetW, widgetH, 'class="mockup-card" rx="10" fill="' + fillSoft + '"/')
    out += rect(mainX + 18, widgetsY + 16, 100, 10, 'rx="3" fill="' + stroke + '" opacity="0.55"/')
    var barsCount = 12
    var barInnerX = mainX + 20
    var barInnerY = widgetsY + 40
    var barInnerW = widgetW - 40
    var barInnerH = widgetH - 60
    var bw = barInnerW / (barsCount * 1.3)
    var gap = bw * 0.3
    var seedBars = [0.45, 0.7, 0.5, 0.8, 0.42, 0.65, 0.55, 0.38, 0.72, 0.6, 0.85, 0.5]
    for (var b = 0; b < barsCount; b++) {
      var bh = barInnerH * seedBars[b]
      var bx = barInnerX + b * (bw + gap)
      var by = barInnerY + barInnerH - bh
      var barColor = b % 3 === 0 ? red : green
      out += rect(bx, by, bw, bh, 'class="mockup-bar" fill="' + barColor + '" opacity="0.8" rx="2"/')
    }

    // Widget 2 : sparkline rouge (cours en baisse)
    var w2x = mainX + widgetW + gridGap
    out += rect(w2x, widgetsY, widgetW, widgetH, 'class="mockup-card" rx="10" fill="' + fillSoft + '"/')
    out += rect(w2x + 18, widgetsY + 16, 110, 10, 'rx="3" fill="' + stroke + '" opacity="0.55"/')
    out += rect(w2x + 18, widgetsY + 32, 70, 16, 'rx="2" fill="' + red + '" opacity="0.9"/')
    var sp2x = w2x + 18
    var sp2y = widgetsY + 60
    var sp2w = widgetW - 36
    var sp2h = widgetH - 80
    var sp2Pts = []
    var seedSp2 = [0.2, 0.3, 0.25, 0.45, 0.4, 0.6, 0.55, 0.7, 0.65, 0.8, 0.78, 0.9, 0.85, 0.95]
    for (var k2 = 0; k2 < 14; k2++) {
      var spx2 = sp2x + (sp2w / 13) * k2
      var spy2 = sp2y + sp2h * seedSp2[k2]
      sp2Pts.push((k2 === 0 ? 'M' : 'L') + spx2.toFixed(1) + ' ' + spy2.toFixed(1))
    }
    out += path(sp2Pts.join(' '), 'class="mockup-stroke" fill="none" stroke="' + red + '" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/')

    // Widget 3 : candlesticks
    var w3x = mainX + (widgetW + gridGap) * 2
    out += rect(w3x, widgetsY, widgetW, widgetH, 'class="mockup-card" rx="10" fill="' + fillSoft + '"/>')
    out += rect(w3x + 18, widgetsY + 16, 90, 10, 'rx="3" fill="' + stroke + '" opacity="0.55"/>')
    var candleX = w3x + 20
    var candleY = widgetsY + 38
    var candleW = widgetW - 40
    var candleH = widgetH - 60
    var candleCount = 9
    var cw = candleW / (candleCount * 1.5)
    var cgap = cw * 0.5
    for (var ck = 0; ck < candleCount; ck++) {
      var openY = candleY + candleH * (0.3 + ((ck * 0.17) % 0.5))
      var closeY = candleY + candleH * (0.4 + ((ck * 0.21) % 0.4))
      var highY = Math.min(openY, closeY) - 10
      var lowY = Math.max(openY, closeY) + 10
      var cx2 = candleX + ck * (cw + cgap) + cw / 2
      var cColor = closeY < openY ? green : red
      // Wick
      out += line(cx2, highY, cx2, lowY, 'class="mockup-pop" stroke="' + cColor + '" stroke-width="1.5" opacity="0.85"/')
      // Body
      out += rect(cx2 - cw / 2, Math.min(openY, closeY), cw, Math.abs(closeY - openY), 'class="mockup-pop" fill="' + cColor + '" opacity="0.85" rx="1"/')
    }

    return out
  }

  function mobile(W, H, accent) {
    var phoneW = Math.min(W * 0.42, H * 0.55)
    var phoneH = phoneW * 2
    var phoneX = (W - phoneW) / 2
    var phoneY = (H - phoneH) / 2
    var stroke = accent || '#ffffff'
    var fillSoft = stroke + '22'
    var radius = phoneW * 0.1
    var out = ''
    // Frame
    out += rect(phoneX, phoneY, phoneW, phoneH, 'rx="' + radius + '" fill="none" stroke="' + stroke + '" stroke-width="3" stroke-opacity="0.5"/')
    out += rect(phoneX + 8, phoneY + 8, phoneW - 16, phoneH - 16, 'rx="' + (radius - 4) + '" fill="' + fillSoft + '"/')
    // Notch
    out += rect(phoneX + phoneW / 2 - 40, phoneY + 18, 80, 18, 'rx="9" fill="' + stroke + '" opacity="0.7"/')
    // Header bar
    out += rect(phoneX + 30, phoneY + 70, phoneW - 60, 14, 'rx="4" fill="' + stroke + '" opacity="0.6"/')
    // Hero image
    out += rect(phoneX + 30, phoneY + 100, phoneW - 60, phoneH * 0.18, 'class="mockup-pop" rx="14" fill="' + stroke + '" opacity="0.18"/')
    // Cards row
    var cardsStart = phoneY + 100 + phoneH * 0.18 + 20
    var miniW = (phoneW - 60 - 16) / 2
    out += rect(phoneX + 30, cardsStart, miniW, phoneH * 0.14, 'class="mockup-card" rx="10" fill="' + stroke + '" opacity="0.15"/')
    out += rect(phoneX + 30 + miniW + 16, cardsStart, miniW, phoneH * 0.14, 'class="mockup-card" rx="10" fill="' + stroke + '" opacity="0.15"/')
    // List rows
    var listY = cardsStart + phoneH * 0.14 + 20
    for (var i = 0; i < 4; i++) {
      var ly = listY + i * 50
      out += circle(phoneX + 45, ly + 18, 14, 'class="mockup-pop" fill="' + stroke + '" opacity="0.7"/')
      out += rect(phoneX + 70, ly + 10, phoneW * 0.45, 8, 'rx="2" fill="' + stroke + '" opacity="0.7"/')
      out += rect(phoneX + 70, ly + 24, phoneW * 0.32, 6, 'rx="2" fill="' + stroke + '" opacity="0.35"/')
      out += rect(phoneX + phoneW - 60, ly + 10, 24, 24, 'rx="6" fill="' + stroke + '" opacity="0.3"/')
    }
    // Tab bar
    var tabY = phoneY + phoneH - 60
    out += rect(phoneX + 8, tabY, phoneW - 16, 48, 'rx="12" fill="' + stroke + '" opacity="0.1"/')
    for (var t = 0; t < 5; t++) {
      var tx = phoneX + 20 + (phoneW - 60) * (t / 4)
      out += circle(tx, tabY + 24, 8, 'fill="' + stroke + '" opacity="' + (t === 2 ? '0.95' : '0.45') + '"/')
    }
    return out
  }

  function ecommerce(W, H, accent) {
    var cols = W > H ? 4 : 3
    var rows = W > H ? 2 : 3
    var pad = 30
    var headerH = Math.round(H * 0.1)
    var gridY = headerH + pad
    var gridH = H - gridY - pad
    var cellW = (W - pad * (cols + 1)) / cols
    var cellH = (gridH - pad * (rows - 1)) / rows
    var stroke = accent || '#ffffff'
    var fillSoft = stroke + '1f'
    var out = ''
    // Header
    out += rect(8, 8, W - 16, headerH, 'rx="12" fill="' + fillSoft + '"/')
    out += circle(45, 8 + headerH / 2, 14, 'fill="' + stroke + '" opacity="0.7"/')
    out += rect(75, 8 + headerH / 2 - 8, 180, 16, 'rx="4" fill="' + stroke + '" opacity="0.4"/')
    out += rect(W - 240, 8 + headerH / 2 - 12, 220, 24, 'rx="12" fill="' + stroke + '" opacity="0.15"/')
    // Grid de cartes
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = pad + c * (cellW + pad)
        var y = gridY + r * (cellH + pad)
        out += rect(x, y, cellW, cellH, 'class="mockup-card" rx="12" fill="' + fillSoft + '"/')
        // Image (3/5 du haut)
        out += rect(x + 14, y + 14, cellW - 28, cellH * 0.6, 'rx="8" fill="' + stroke + '" opacity="0.22"/')
        // Titre
        out += rect(x + 14, y + cellH * 0.6 + 26, cellW * 0.55, 10, 'rx="2" fill="' + stroke + '" opacity="0.6"/')
        // Prix
        out += rect(x + 14, y + cellH * 0.6 + 44, cellW * 0.3, 14, 'rx="3" fill="' + stroke + '" opacity="0.9"/')
        // Tag prix barré
        out += rect(x + 14 + cellW * 0.3 + 8, y + cellH * 0.6 + 46, cellW * 0.18, 8, 'rx="2" fill="' + stroke + '" opacity="0.3"/')
      }
    }
    return out
  }

  function data(W, H, accent) {
    var stroke = accent || '#ffffff'
    var fillSoft = stroke + '1f'
    var pad = 30
    var rows = 2
    var cols = 2
    var cellW = (W - pad * (cols + 1)) / cols
    var cellH = (H - pad * (rows + 1)) / rows
    var out = ''
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = pad + c * (cellW + pad)
        var y = pad + r * (cellH + pad)
        out += rect(x, y, cellW, cellH, 'class="mockup-card" rx="14" fill="' + fillSoft + '"/')
        // Title bar
        out += rect(x + 20, y + 20, cellW * 0.5, 12, 'rx="3" fill="' + stroke + '" opacity="0.5"/')
        // Big number
        out += rect(x + 20, y + 50, cellW * 0.4, 32, 'rx="4" fill="' + stroke + '" opacity="0.85"/')
        // Chart : line for r=0, bars for r=1
        var chartX = x + 20
        var chartY = y + 110
        var chartW = cellW - 40
        var chartH = cellH - 130
        if (r === 0) {
          // Line / sparkline
          var n = 14
          var dx = chartW / (n - 1)
          var pts = []
          for (var k = 0; k < n; k++) {
            var px = chartX + k * dx
            var alt = (Math.sin(k * 0.9 + c) * 0.3 + 0.5)
            var py = chartY + chartH * (1 - alt)
            pts.push((k === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1))
          }
          out += path(pts.join(' '), 'class="mockup-stroke" fill="none" stroke="' + stroke + '" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/')
        } else {
          // Bars
          var bars = 8
          var bw = chartW / (bars * 1.5)
          var gap = bw * 0.5
          for (var b = 0; b < bars; b++) {
            var bh = chartH * (0.25 + ((b + c) * 0.13) % 0.75)
            var bx = chartX + b * (bw + gap)
            var by = chartY + chartH - bh
            out += rect(bx, by, bw, bh, 'class="mockup-bar" fill="' + stroke + '" opacity="0.75" rx="2"/')
          }
        }
      }
    }
    return out
  }

  function editorial(W, H, accent) {
    var stroke = accent || '#ffffff'
    var fillSoft = stroke + '1a'
    var cols = W > H ? 3 : 2
    var pad = 36
    var colW = (W - pad * (cols + 1)) / cols
    var topH = Math.round(H * 0.32)
    var out = ''
    // Hero
    out += rect(pad, pad, W - pad * 2, topH, 'rx="12" fill="' + fillSoft + '"/')
    out += rect(pad + 30, pad + topH - 70, (W - pad * 2) * 0.5, 16, 'rx="4" fill="' + stroke + '" opacity="0.9"/')
    out += rect(pad + 30, pad + topH - 44, (W - pad * 2) * 0.35, 10, 'rx="3" fill="' + stroke + '" opacity="0.5"/')
    // Columns of lines
    var colY = topH + pad * 1.5
    var colH = H - colY - pad
    for (var c = 0; c < cols; c++) {
      var cx = pad + c * (colW + pad)
      out += rect(cx, colY, colW, colW * 0.6, 'class="mockup-card" rx="10" fill="' + fillSoft + '"/')
      var linesStart = colY + colW * 0.6 + 16
      var lineCount = Math.floor((colH - colW * 0.6 - 16) / 18)
      for (var l = 0; l < lineCount; l++) {
        var w = colW * (l === 0 ? 0.85 : l === lineCount - 1 ? 0.55 : 0.95)
        out += rect(cx, linesStart + l * 18, w, 6, 'rx="2" fill="' + stroke + '" opacity="' + (l === 0 ? '0.9' : '0.35') + '"/')
      }
    }
    return out
  }

  function decorativeBlobs(W, H, accent) {
    // Toujours utilisé en complément (hook, cta, ou theme=default)
    var stroke = accent || '#ffffff'
    var out = ''
    var blobCount = 4
    var seedR = [0.22, 0.16, 0.28, 0.14]
    var seedX = [0.15, 0.85, 0.78, 0.22]
    var seedY = [0.25, 0.18, 0.78, 0.82]
    for (var i = 0; i < blobCount; i++) {
      var r = Math.min(W, H) * seedR[i]
      var cx = W * seedX[i]
      var cy = H * seedY[i]
      out += circle(cx, cy, r, 'class="mockup-blob" fill="' + stroke + '" opacity="' + (i % 2 === 0 ? '0.06' : '0.04') + '"/')
    }
    return out
  }

  /** Construit le SVG complet d'un mockup pour un theme donné.
   *  Renvoie une string SVG complète qu'on peut insérer via innerHTML.
   */
  function buildMockupSvg(theme, W, H, accent) {
    var inner
    switch (theme) {
      case 'dashboard': inner = dashboard(W, H, accent); break
      case 'mobile':    inner = mobile(W, H, accent); break
      case 'ecommerce': inner = ecommerce(W, H, accent); break
      case 'data':      inner = data(W, H, accent); break
      case 'editorial': inner = editorial(W, H, accent); break
      default:          inner = decorativeBlobs(W, H, accent); break
    }
    return (
      '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block">' +
      inner +
      '</svg>'
    )
  }

  root.HFMockups = { buildMockupSvg: buildMockupSvg, decorativeBlobs: decorativeBlobs }
  console.log('[HFMockups] loaded — themes: dashboard, mobile, ecommerce, data, editorial, default')
})(window)
