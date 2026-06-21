#!/usr/bin/env python3
"""Génère reel.html : un reel vertical 1080x1920 qui RÉUTILISE les sections animées
du site public/promo (même CSS, mêmes mock-ups animés, mêmes messages)."""
import re, pathlib, base64, shutil

HERE = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "public/promo/index.html"
OUT = HERE / "reel.html"
html = SRC.read_text(encoding="utf-8")

# Assets du site rapatriés en local (chemins relatifs)
shutil.copytree(ROOT / "public/promo/assets", HERE / "assets", dirs_exist_ok=True)

# Police Jura embarquée (base64) — demandée par l'utilisateur, et offline-safe
jb64 = base64.b64encode((HERE / "fonts/jura-latin.woff2").read_bytes()).decode()
jura_face = ("@font-face{font-family:'Jura';font-style:normal;font-weight:400 700;font-display:block;"
             "src:url(data:font/woff2;base64," + jb64 + ") format('woff2');}")

# 1) Récupère tout le CSS du site (tous les blocs <style>)
css = "\n".join(re.findall(r"<style>(.*?)</style>", html, re.S))

# 2) Extrait chaque scène module : id, numéro, titre, liste, visuel animé
scene_re = re.compile(r'<div class="scene" id="([^"]+)">(.*?)\n      </div>\n', re.S)
scenes = {}
for sid, body in scene_re.findall(html):
    num = re.search(r'<span class="scene-num[^>]*>([^<]+)</span>', body)
    h2 = re.search(r'<h2>(.*?)</h2>', body, re.S)
    lst = re.search(r'<ul class="scene-list">(.*?)</ul>', body, re.S)
    vis = re.search(r'(<div class="scene-visual">.*</div>)\s*$', body, re.S)
    if not (num and h2 and vis):
        continue
    scenes[sid] = {
        "num": num.group(1).strip(),
        "h2": h2.group(1).strip(),
        "list": lst.group(1).strip() if lst else "",
        # force l'état animé "is-in" (sinon les animations attendent le scroll)
        "visual": vis.group(1).replace('class="scene-visual"', 'class="scene-visual is-in"', 1),
    }

print("Scènes trouvées :", ", ".join(scenes.keys()))

# 3) Ordre narratif du reel (on garde celles qui existent)
order = ["import", "editer", "pim", "scraper", "imgen", "dam",
         "workflows", "export", "veille", "telegram"]
order = [s for s in order if s in scenes] or list(scenes.keys())
order = order[:10]
print("Reel :", ", ".join(order))

# 4) Cartes
cards = []
for i, sid in enumerate(order):
    s = scenes[sid]
    cards.append(f'''
    <div class="rl-card" data-i="{i}">
      <div class="rl-head">
        <span class="rl-num grad-text">{s['num']}</span>
        <h2 class="rl-title">{s['h2']}</h2>
        <ul class="rl-list">{s['list']}</ul>
      </div>
      <div class="rl-stage"><div class="scene" id="{sid}">{s['visual']}</div></div>
    </div>''')

intro = '''
    <div class="rl-card rl-cover" data-i="-1">
      <div class="rl-coverwrap">
        <div class="rl-logo"><svg viewBox="0 0 24 24" stroke="#fff" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
        <span class="rl-num grad-text">IBS·STUDIO</span>
        <h1 class="rl-hero">Du data au print.<br><span class="grad-text">Et au digital.</span></h1>
        <p class="rl-sub">20 modules. Un seul flux. Scrapez, créez, déclinez, exportez — sans changer d'outil.</p>
      </div>
    </div>'''

outro = '''
    <div class="rl-card rl-cover" data-i="99">
      <div class="rl-coverwrap">
        <div class="rl-logo"><svg viewBox="0 0 24 24" stroke="#fff" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
        <h1 class="rl-hero">Centralisez<br><span class="grad-text">tout.</span></h1>
        <a class="rl-cta">Découvrir ibs-studio.com →</a>
      </div>
    </div>'''

reel_css = '''
/* ---- overrides reel vertical ---- */
html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}
#rl-stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
#rl-frame{position:relative;width:1080px;height:1920px;overflow:hidden;
  background:radial-gradient(900px 600px at 80% -8%,rgba(124,108,255,.16),transparent 60%),var(--bg,#0b0b11);
  transform-origin:center center}
.rl-card{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-start;
  gap:0;padding:96px 72px;opacity:0;visibility:hidden;transition:opacity .6s ease}
.rl-card.on{opacity:1;visibility:visible}
.rl-head{display:flex;flex-direction:column;gap:24px;flex:0 0 auto}
.rl-num{font-size:32px;font-weight:800;letter-spacing:.14em}
.rl-title{font-size:88px;line-height:1.02;font-weight:800;letter-spacing:-.03em;margin:0;color:var(--ink,#fff)}
.rl-list{display:flex;flex-direction:column;gap:18px;margin:8px 0 0;padding:0;list-style:none}
.rl-list li{font-size:37px;line-height:1.3;color:var(--mut,rgba(255,255,255,.6));padding-left:42px;position:relative}
.rl-list li::before{content:"";position:absolute;left:0;top:.55em;width:22px;height:3px;border-radius:2px;background:var(--grad,#7c6cff)}
/* le mock-up animé du site occupe tout l'espace vertical restant */
.rl-stage .scene{display:block!important;grid-template-columns:none!important;padding:0!important;gap:0!important}
.rl-stage{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;margin-top:40px}
.rl-stage .scene-visual{position:relative;width:100%;transform:scale(1.06);transform-origin:center}
.rl-stage .screen{width:100%}
.rl-card.rl-cover{align-items:center;justify-content:center;text-align:center}
.rl-coverwrap{display:flex;flex-direction:column;align-items:center;gap:30px}
.rl-logo{width:96px;height:96px;border-radius:24px;background:#6366F1;display:flex;align-items:center;justify-content:center;box-shadow:0 0 50px rgba(99,102,241,.6)}
.rl-logo svg{width:52px;height:52px}
.rl-hero{font-size:128px;line-height:.98;font-weight:800;letter-spacing:-.04em;margin:0;color:#fff}
.rl-sub{font-size:40px;line-height:1.4;color:var(--mut,rgba(255,255,255,.62));max-width:820px;margin:0}
.rl-cta{display:inline-flex;background:var(--grad,#7c6cff);color:#0b0b12;font-size:42px;font-weight:800;padding:34px 56px;border-radius:22px;box-shadow:0 24px 70px rgba(124,108,255,.5);margin-top:14px}
/* contrôles */
#rl-bar{position:fixed;left:0;right:0;bottom:0;display:flex;gap:14px;align-items:center;padding:16px 22px;z-index:99;font-family:system-ui,sans-serif;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.55))}
#rl-bar button{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.22);width:46px;height:46px;border-radius:12px;font-size:18px;cursor:pointer}
#rl-prog{flex:1;height:6px;background:rgba(255,255,255,.18);border-radius:3px;overflow:hidden}
#rl-prog>i{display:block;height:100%;width:0;background:#7c6cff;border-radius:3px}
body.rl-clean #rl-bar{display:none}
/* police Jura demandée — titres & messages du reel */
:root{--display:'Jura',ui-sans-serif,sans-serif}
.rl-num,.rl-title,.rl-hero,.rl-sub,.rl-cta,.rl-list,.rl-list li{font-family:'Jura',ui-sans-serif,sans-serif}
'''

player = '''
<div id="rl-bar"><button id="rl-play">&#9208;</button><div id="rl-prog"><i></i></div><span id="rl-count"></span></div>
<script>
(function(){
  if(location.search.indexOf("clean")>-1) document.body.classList.add("rl-clean");
  var frame=document.getElementById("rl-frame");
  function fit(){var s=Math.min(window.innerWidth/1080,window.innerHeight/1920);frame.style.transform="scale("+s+")";}
  window.addEventListener("resize",fit);fit();
  var cards=[].slice.call(document.querySelectorAll(".rl-card"));
  var DUR=[].map.call(cards,function(c){return c.classList.contains("rl-cover")?3800:5200;});
  var i=0,playing=true,timer=null,prog=document.querySelector("#rl-prog>i"),cnt=document.getElementById("rl-count");
  function retrigger(c){var v=c.querySelector(".scene-visual");if(v){v.classList.remove("is-in");void v.offsetWidth;v.classList.add("is-in");}}
  function show(n){
    if(timer)clearTimeout(timer);
    cards.forEach(function(c,k){c.classList.toggle("on",k===n);});
    retrigger(cards[n]); i=n;
    cnt.textContent=(n+1)+" / "+cards.length;
    prog.style.transition="none";prog.style.width="0";
    if(playing){requestAnimationFrame(function(){requestAnimationFrame(function(){
      prog.style.transition="width "+DUR[n]+"ms linear";prog.style.width="100%";});});
      timer=setTimeout(next,DUR[n]);}
  }
  function next(){ if(location.search.indexOf("clean")>-1 && i===cards.length-1){playing=false;document.body.dataset.done="1";return;} show((i+1)%cards.length); }
  var pb=document.getElementById("rl-play");
  pb.addEventListener("click",function(){playing=!playing;pb.innerHTML=playing?"&#9208;":"&#9654;";if(playing)show(i);else if(timer)clearTimeout(timer);});
  document.addEventListener("keydown",function(e){if(e.code==="Space"){e.preventDefault();pb.click();}else if(e.code==="ArrowRight"){show((i+1)%cards.length);}else if(e.code==="ArrowLeft"){show((i-1+cards.length)%cards.length);}});
  show(0);
})();
</script>'''

doc = f'''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IBS-Studio — Reel promo (sections du site)</title>
<style>{css}</style>
<style>{jura_face}</style>
<style>{reel_css}</style>
</head>
<body>
<div id="rl-stage"><div id="rl-frame">
{intro}{''.join(cards)}{outro}
</div></div>
{player}
</body>
</html>'''

doc = doc.replace('/promo/assets/', 'assets/')   # chemins assets en relatif
OUT.write_text(doc, encoding="utf-8")
print("Écrit :", OUT, f"({len(doc)//1024} Ko)")
