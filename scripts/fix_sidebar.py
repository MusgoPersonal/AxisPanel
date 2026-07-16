import os, re

SIDEBAR_CSS = """
#axis-sidebar{position:fixed;left:0;top:0;width:200px;height:100vh;background:#0a0b10;z-index:99999;display:flex;flex-direction:column;border-right:2px solid #4ade80;font-family:Inter,sans-serif;overflow:hidden;transition:left 0.3s cubic-bezier(0.4,0,0.2,1);}
.as-brand{padding:14px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.06);color:#f0fdf4;font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;}
.as-a{color:#4ade80;}
.as-sub{font-size:10px;color:#6b7a74;font-weight:400;margin-left:auto;}
.as-close{background:none;border:none;color:#6b7a74;font-size:14px;cursor:pointer;padding:2px 6px;border-radius:4px;}
.as-close:hover{background:rgba(255,255,255,0.06);color:#f0fdf4;}
.as-nav{flex:1;overflow-y:auto;padding:6px;}
.as-cat{display:flex;align-items:center;gap:6px;padding:5px 8px;font-size:11px;color:#6b7a74;font-weight:600;cursor:pointer;border-radius:4px;}
.as-cat:hover{background:rgba(255,255,255,0.03);}
.as-items{display:flex;flex-direction:column;gap:1px;padding-left:4px;margin-bottom:4px;}
.as-items.as-hide{display:none;}
.as-btn{display:flex;align-items:center;gap:6px;width:100%;padding:5px 8px;background:none;border:none;border-radius:4px;color:#a8b5b0;font-size:12px;font-family:Inter,sans-serif;cursor:pointer;text-align:left;transition:all 0.1s;text-decoration:none;box-sizing:border-box;}
.as-btn:hover{background:rgba(255,255,255,0.04);color:#f0fdf4;}
.as-btn.act{background:rgba(74,222,128,0.08);color:#4ade80;}
.as-footer{display:flex;justify-content:space-between;padding:8px 14px;border-top:1px solid rgba(255,255,255,0.06);font-size:10px;color:#6b7a74;}
body{padding-left:200px !important;transition:padding-left 0.3s cubic-bezier(0.4,0,0.2,1);}
#as-toggle{display:none;}
body.sb-closed #axis-sidebar{left:-200px !important;transition:left 0.3s cubic-bezier(0.4,0,0.2,1);}
body.sb-closed #as-toggle{display:block !important;position:fixed;left:4px;top:28px;z-index:100000;background:#0a0b10;border:1px solid #4ade80;color:#4ade80;font-size:18px;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:Inter,sans-serif;}
body.sb-closed #as-toggle:hover{background:#4ade80;color:#000;}
body.sb-closed{padding-left:0 !important;}
@media(max-width:768px){#axis-sidebar{left:-200px !important;}#as-toggle{display:block !important;position:fixed;left:4px;top:28px;z-index:100000;background:#0a0b10;border:1px solid #4ade80;color:#4ade80;font-size:18px;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:Inter,sans-serif;}body.sb-open #axis-sidebar{left:0 !important;box-shadow:4px 0 20px rgba(0,0,0,0.5);}}
"""

SIDEBAR_HTML = """<!-- SIDEBAR -->
<button id="as-toggle" onclick="toggleSidebar()">☰</button>
<div id="axis-sidebar">
  <div class="as-brand"><span class="as-a">A</span>xis <span class="as-sub">command center</span><button class="as-close" onclick="toggleSidebar()">✕</button></div>
  <div class="as-nav">
    <div class="as-section"><div class="as-cat" onclick="this.nextElementSibling.classList.toggle('as-hide')">&#9674; Inicio &#9660;</div><div class="as-items"><a class="as-btn" href="/">&#9674; Dashboard</a></div></div>
    <div class="as-section"><div class="as-cat" onclick="this.nextElementSibling.classList.toggle('as-hide')">&#128172; Chat &#9660;</div><div class="as-items"><a class="as-btn" href="chat.html">&#128172; Axis Chat</a></div></div>
    <div class="as-section"><div class="as-cat" onclick="this.nextElementSibling.classList.toggle('as-hide')">&#128269; Captura &#9660;</div><div class="as-items"><a class="as-btn" href="scraper.html">&#128269; Scraper</a><a class="as-btn" href="crm.html">&#128203; CRM</a></div></div>
    <div class="as-section"><div class="as-cat" onclick="this.nextElementSibling.classList.toggle('as-hide')">&#9881;&#65039; Gesti&#243;n &#9660;</div><div class="as-items"><a class="as-btn" href="keys.html">&#128273; Keys</a><a class="as-btn" href="settings.html">&#9881;&#65039; Ajustes</a></div></div>
  </div>
  <div class="as-footer"><span>v3</span><span id="as-clock">--:--</span></div>
</div>
<style>""" + SIDEBAR_CSS + """</style>
<script>
function toggleSidebar(){document.body.classList.toggle('sb-closed');localStorage.setItem('sb-closed',document.body.classList.contains('sb-closed'));}
if(localStorage.getItem('sb-closed')==='true')document.body.classList.add('sb-closed');
document.addEventListener('click',function(e){var btn=e.target.closest('.as-btn');if(btn){document.querySelectorAll('.as-btn').forEach(function(b){b.classList.remove('act');});btn.classList.add('act');}});
setTimeout(function(){var p=window.location.pathname.split('/').pop()||'index.html';document.querySelectorAll('.as-btn').forEach(function(b){if(b.getAttribute('href')===p||((p==='/'||p===''||p==='index.html')&&b.getAttribute('href')==='/'))b.classList.add('act');});},50);
</script>"""

base = r'C:\AxisPanel\public'
for page in ['chat.html','scraper.html','crm.html','keys.html','settings.html']:
    path = os.path.join(base, page)
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()
    
    # Remove old sidebar (from '<!-- SIDEBAR' to end)
    idx = c.find('<!-- SIDEBAR')
    if idx > 0:
        body_end = c.rfind('</body>', 0, idx)
        if body_end > 0:
            c = c[:body_end + 7]
    
    # Remove any leftover sidebar artifacts
    c = re.sub(r'body\.sb-closed\{padding-left:0[^}]*\}\n*', '', c)
    
    # Inject clean sidebar
    c = c.replace('</body>', SIDEBAR_HTML + '\n</body>')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(c)
    print('OK: ' + page)
