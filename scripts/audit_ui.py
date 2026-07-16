"""Axis Panel UI Audit - Element by Element, Page by Page"""
import os, re

base = r'C:\AxisPanel\public'
pages = {
    'index.html': 'Panel Principal (index.html)',
    'chat.html': 'Chat Independiente',
    'scraper.html': 'Scraper',
    'crm.html': 'CRM',
    'keys.html': 'API Keys',
    'settings.html': 'Ajustes'
}

for filename, label in pages.items():
    path = os.path.join(base, filename)
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()
    
    print(f"\n{'='*60}")
    print(f"📄 {label} ({filename})")
    print(f"{'='*60}")
    print(f"Tamaño: {len(c)} bytes | Líneas: {c.count(chr(10))}")
    
    # === SIDEBAR ===
    print(f"\n  🔲 SIDEBAR")
    has_sidebar = 'axis-sidebar' in c
    has_toggle = 'as-toggle' in c
    has_close = 'as-close' in c
    padding_left_css = 'padding-left:200' in c
    body_inline = 'style=\"padding-left:200' in c
    sb_closed_rule = 'body.sb-closed{padding-left:0' in c
    toggle_js = 'toggleSidebar' in c
    
    print(f"    #axis-sidebar div:     {'✅' if has_sidebar else '❌'} ")
    print(f"    #as-toggle button:      {'✅' if has_toggle else '❌'} ")
    print(f"    .as-close button:       {'✅' if has_close else '❌'} ")
    print(f"    body padding-left (CSS):{'✅' if padding_left_css else '❌'} ")
    print(f"    body padding-left (inline):{'✅' if body_inline else '❌'} ")
    print(f"    .sb-closed resets pad:  {'✅' if sb_closed_rule else '❌'} ")
    print(f"    toggleSidebar JS:       {'✅' if toggle_js else '❌'} ")
    
    # Count sidebar elements
    sidebar_el = c.count('axis-sidebar')
    toggle_el = c.count('as-toggle')
    print(f"    Duplicación: #axis-sidebar aparece {sidebar_el}v, #as-toggle {toggle_el}v")
    
    # === <style> blocks ===
    styles = re.findall(r'<style>(.*?)</style>', c, re.DOTALL)
    print(f"\n  📦 <style> BLOCKS: {len(styles)}")
    for i, s in enumerate(styles):
        lines = s.strip().count('\n') + 1
        has_important = '!important' in s
        print(f"    [{i}] {lines} líneas {'⚠️ has !important' if has_important else ''}")
    
    # === <body> structure ===
    body_match = re.search(r'<body[^>]*>', c)
    if body_match:
        body_tag = body_match.group()
        if 'padding-left' in body_tag:
            print(f"  💪 BODY tag: ✅ inline padding found")
        else:
            print(f"  💪 BODY tag: ❌ NO inline padding")
    
    # === Closing tags ===
    has_body_end = '</body>' in c
    has_html_end = '</html>' in c
    print(f"\n  🔚 CIERRE: </body>={'✅' if has_body_end else '❌'}, </html>={'✅' if has_html_end else '❌'}")
    
    # === CSS variable check ===
    missing_vars = []
    if 'var(--input-bg)' in c and '--input-bg' not in c[:c.index(':root')+200 if ':root' in c else 0]:
        missing_vars.append('--input-bg')
    if missing_vars:
        print(f"\n  ⚠️  Variables CSS usadas pero no definidas: {missing_vars}")
    
    # === Page-specific checks ===
    if 'chat.html' in filename:
        agent_sel = 'chat-agent' in c
        routing_btn = 'routing-btn' in c or 'chat-routing' in c
        msgs_area = 'chat-msgs' in c or 'chat-messages' in c
        chat_bar = 'chat-bar' in c or 'chat-input' in c
        skills_rail = 'skills-rail' in c
        print(f"\n  💬 CHAT SPECIFIC:")
        print(f"    Agente selector:    {'✅' if agent_sel else '❌'}")
        print(f"    Botón enrutador:    {'✅' if routing_btn else '❌'}")
        print(f"    Área mensajes:      {'✅' if msgs_area else '❌'}")
        print(f"    Input bar:          {'✅' if chat_bar else '❌'}")
        print(f"    Skills rail:        {'✅' if skills_rail else '❌'}")
    
    elif 'scraper.html' in filename:
        autofocus = 'autofocus' in c
        leads_grid = '.leads-grid' in c
        search_input = 'id=\"query\"' in c
        print(f"\n  🔍 SCRAPER SPECIFIC:")
        print(f"    Input autofocus:    {'✅' if autofocus else '❌'}")
        print(f"    .leads-grid:        {'✅' if leads_grid else '❌'}")
    
    elif 'index.html' in filename:
        launchpad = 'mac-launchpad' in c
        floating_nav = 'floating-nav' in c
        duplicate_clock = c.count('setInterval') > 1 and 'startMacClock' in c
        has_dock = 'mac-dock' in c
        print(f"\n  🏠 INDEX SPECIFIC:")
        print(f"    Launchpad (dead):   {'❌ AÚN PRESENTE' if launchpad else '✅ eliminado'}")
        print(f"    Floating nav (dead):{'❌ AÚN PRESENTE' if floating_nav else '✅ eliminado'}")
        print(f"    Dock flotante:      {'❌ AÚN PRESENTE' if has_dock else '✅ eliminado'}")
        print(f"    Reloj duplicado:    {'⚠️' if duplicate_clock else '✅ único'}")
    
    elif 'keys.html' in filename:
        add_form_trans = 'transition:opacity' in c
        print(f"\n  🔑 KEYS SPECIFIC:")
        print(f"    add-form transición:{'✅' if add_form_trans else '❌'}")
    
    elif 'settings.html' in filename:
        status_badges = '.status.off' in c
        alert_replaced = 'alert(' not in c
        print(f"\n  ⚙️ SETTINGS SPECIFIC:")
        print(f"    Status badges:      {'✅' if status_badges else '❌'}")
        print(f"    Sin alert():        {'✅' if alert_replaced else '❌'}")
    
    elif 'crm.html' in filename:
        kanban_cols = 'min-height:150' in c
        nav_select = '<select' in c and 'window.location' in c
        print(f"\n  📋 CRM SPECIFIC:")
        print(f"    Kanban min-height:   {'✅' if kanban_cols else '❌'}")
        print(f"    Nav duplicado:      {'❌' if nav_select else '✅ ok'}")

print("\n" + "="*60)
print("🏁 AUDITORÍA COMPLETA")
print("="*60)
