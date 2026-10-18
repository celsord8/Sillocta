"""Create high-quality, content-hashed intermediate sizes; preserve originals."""
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import hashlib, io, json, math, re
root = Path(__file__).resolve().parent.parent
source = root / 'source'
manifest = json.loads((source / 'media.json').read_text())
added = []
for asset, media in manifest.items():
    widths = {entry['width'] for entry in media['sources']}
    candidates = ([480, 800] if 'campaign-' in asset else [480] if 'img-' in asset else [640])
    original = Image.open(source / asset).convert('RGB')
    for width in candidates:
        if width in widths or width >= original.width:
            continue
        height = round(original.height * width / original.width)
        reference = original.resize((width, height), Image.Resampling.LANCZOS)
        quality = 94
        output = io.BytesIO()
        reference.save(output, 'WEBP', quality=quality, method=6)
        data = output.getvalue()
        decoded = Image.open(io.BytesIO(data)).convert('RGB')
        mse = sum(v*v for v in ImageStat.Stat(ImageChops.difference(reference, decoded)).rms)/3
        psnr = round(10*math.log10(255**2/mse), 2) if mse else 99
        name = f'assets/responsive/{Path(asset).stem}-{width}-{hashlib.sha256(data).hexdigest()[:12]}.webp'
        (source/name).write_bytes(data)
        media['sources'].append(dict(url=name,width=width,height=height,bytes=len(data),quality=quality,psnr=psnr))
        added.append((name,len(data),psnr))
    media['sources'].sort(key=lambda entry: entry['width'])
(source/'media.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
products = json.loads((source/'products.json').read_text())
for product in products:
    if product['image'] in manifest:
        product['media'] = manifest[product['image']]
(source/'products.json').write_text(json.dumps(products,ensure_ascii=False,indent=2)+'\n')
html = (source/'index.html').read_text()
def update_tag(match):
    tag=match.group()
    src=re.search(r'\b(?:src|href)="/([^"?]+)"',tag)
    if not src or src[1] not in manifest: return tag
    srcset=', '.join('/'+entry['url']+' '+str(entry['width'])+'w' for entry in manifest[src[1]]['sources'])
    return re.sub(r'\b(imagesrcset|srcset)="[^"]*"',lambda m:m[1]+'="'+srcset+'"',tag)
html=re.sub(r'<(?:img|link)\b[^>]*>',update_tag,html)
# Keep the embedded catalog identical to the canonical product data.
html=re.sub(r'(<script[^>]*id="sillocta-products"[^>]*>)[\s\S]*?(</script>)',lambda m:m[1]+json.dumps(products,ensure_ascii=False,separators=(',',':'))+m[2],html)
(source/'index.html').write_text(html)
for entry in added: print(*entry)
