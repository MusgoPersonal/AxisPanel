import json, sys, os, re, time
from scrapling.fetchers import StealthyFetcher, Fetcher
from urllib.parse import quote

CONFIG_DIR = os.path.join(os.environ.get('USERPROFILE', '.'), '.config')
LEADS_FILE = os.path.join(CONFIG_DIR, 'leads.json')

def load_leads():
    try:
        with open(LEADS_FILE, 'r') as f:
            return json.load(f)
    except:
        return {"leads": [], "nextId": 1}

def save_leads(db):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(LEADS_FILE, 'w') as f:
        json.dump(db, f, indent=2, ensure_ascii=False)

def normalize_phone(phone):
    if not phone: return None
    cleaned = re.sub(r'\D', '', phone)
    cleaned = re.sub(r'^56', '', cleaned)
    cleaned = re.sub(r'^0', '', cleaned)
    return cleaned

def calc_score(name, phone, website, rating, reviews):
    s = 0
    if rating: s += min(float(rating) * 10, 50)
    if reviews: s += min(int(reviews) / 10, 30)
    if phone: s += 10
    if website: s += 15
    return min(int(s), 100)

def scrape_google_maps(query, category, max_results=50):
    db = load_leads()
    saved = 0
    existing_ids = set(l.get('source_id') for l in db.get('leads', []) if l.get('source') == 'scrapling')
    next_id = db.get('nextId', 1)

    search_url = f"https://www.google.com/maps/search/{quote(query)}"
    print(f"[Scrapling] Fetching: {search_url}")

    page = StealthyFetcher.fetch(search_url, headless=True, network_idle=True, timeout=30000)

    if not page:
        print("[Scrapling] Fallback to HTTP Fetcher...")
        page = Fetcher.get(search_url, stealthy_headers=True)

    cards = page.css('div[role="article"]') or page.css('.Nv2PK') or page.css('.THOPZb')
    if not cards:
        cards = page.css('a[href*="/maps/place/"]')
    if not cards:
        print("[Scrapling] No cards found. Saving debug HTML...")
        with open('debug_scrapling.html', 'w', encoding='utf-8') as f:
            f.write(str(page))
        print("[Scrapling] Debug saved to debug_scrapling.html")
        return 0

    print(f"[Scrapling] Found {len(cards)} results")

    for card in cards[:max_results]:
        try:
            name_el = card.css('.qBF1Pd') or card.css('.fontHeadlineSmall') or card.css('h3') or card.css('.lIq3Ye')
            name = name_el[0].text_content().strip() if name_el else ''

            if not name:
                continue

            source_id = None
            href = card.css('::attr(href)').get() or card.attrib.get('href', '')
            m = re.search(r'place/([^/]+)', href)
            if m:
                source_id = m.group(1)

            rating_el = card.css('.MW4etd') or card.css('span[aria-label*="estrela"]') or card.css('.F7nice')
            rating = rating_el[0].text_content().strip() if rating_el else None

            reviews_el = card.css('.UY7F9') or card.css('span[aria-label*="avalia"]')
            reviews = reviews_el[0].text_content().strip().replace('(', '').replace(')', '') if reviews_el else None

            if source_id and source_id in existing_ids:
                continue

            lead = {
                "id": next_id,
                "source": "scrapling",
                "source_id": source_id or name.lower().replace(' ', '-'),
                "name": name,
                "category": category,
                "address": None,
                "phone": None,
                "email": None,
                "website": None,
                "rating": float(rating) if rating else None,
                "reviews_count": int(re.sub(r'\D', '', reviews)) if reviews else None,
                "score": calc_score(name, None, None, rating, reviews),
                "status": "new",
                "created_at": time.strftime('%Y-%m-%dT%H:%M:%S'),
                "updated_at": time.strftime('%Y-%m-%dT%H:%M:%S')
            }
            db['leads'].append(lead)
            existing_ids.add(source_id)
            next_id += 1
            saved += 1
            print(f"  [{saved}] {name} (rating: {rating or 'N/A'})")

        except Exception as e:
            print(f"  [Error] {e}")

    db['nextId'] = next_id
    save_leads(db)
    print(f"[Scrapling] Saved {saved} leads to {LEADS_FILE}")
    return saved

if __name__ == '__main__':
    query = sys.argv[1] if len(sys.argv) > 1 else 'clinica dental santiago'
    category = sys.argv[2] if len(sys.argv) > 2 else 'clinicas_dentales'
    max_r = int(sys.argv[3]) if len(sys.argv) > 3 else 50
    result = scrape_google_maps(query, category, max_r)
    print(json.dumps({"saved": result}))
