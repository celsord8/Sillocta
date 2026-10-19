"""Prepare native-resolution carousel crops; never alter or upscale originals."""
from pathlib import Path
from PIL import Image, ImageOps, ImageChops, ImageStat
import hashlib, io, json, math, re

root = Path(__file__).resolve().parent.parent
source = root / 'source'
campaigns = json.loads((source / 'campaigns.json').read_text())
html = (source / 'index.html').read_text()
sizes = {
    'mobile': '(max-width: 360px) calc((100vw - 28px) * .84), calc((100vw - 36px) * .84)',
    'desktop': '(max-width: 1060px) calc((100vw - 48px) * .62), 620px',
}
for campaign in campaigns:
    original = Image.open(source / campaign['image']).convert('RGB')
    assert hashlib.sha256((source / campaign['image']).read_bytes()).hexdigest() == campaign['media']['originalSha256']
    focus = tuple(float(part.strip('%')) / 100 for part in campaign['position'].split())
    prepared = {}
    for layout, ratio in [('mobile', 1.78), ('desktop', 2.15)]:
        # Match CSS cover/object-position once, before encoding, so invisible
        # square-image pixels neither consume bandwidth nor mislead srcset.
        native_width = min(original.width, math.floor(original.height * ratio))
        native_height = round(native_width / ratio)
        crop = ImageOps.fit(original, (native_width, native_height), Image.Resampling.LANCZOS, centering=focus)
        entries = []
        for width in sorted({480, 640, 960, min(1280, native_width)}):
            if width > native_width:
                continue
            height = round(width / ratio)
            reference = crop.resize((width, height), Image.Resampling.LANCZOS)
            encoded = io.BytesIO()
            reference.save(encoded, 'WEBP', quality=95, method=6)
            data = encoded.getvalue()
            decoded = Image.open(io.BytesIO(data)).convert('RGB')
            mse = sum(v*v for v in ImageStat.Stat(ImageChops.difference(reference, decoded)).rms)/3
            psnr = round(10*math.log10(255**2/mse), 2) if mse else 99
            asset = f'assets/responsive/{Path(campaign["image"]).stem}-{layout}-{width}-{hashlib.sha256(data).hexdigest()[:12]}.webp'
            (source / asset).write_bytes(data)
            entries.append(dict(url=asset, width=width, height=height, bytes=len(data), quality=95, psnr=psnr))
        prepared[layout] = dict(ratio=ratio, focus=campaign['position'], nativeWidth=native_width, nativeHeight=native_height, sizes=sizes[layout], sources=entries)
    campaign['displayMedia'] = prepared
    def srcset(layout):
        return ', '.join('/'+item['url']+' '+str(item['width'])+'w' for item in prepared[layout]['sources'])
    # Original width/height attributes now describe the displayed mobile crop.
    def replace_card(match):
        card = match.group()
        image = re.search(r'<img\b[^>]*>', card).group()
        image = re.sub(r'\s(?:src|srcset|sizes|width|height)="[^"]*"', '', image)
        fallback = next(item for item in prepared['mobile']['sources'] if item['width'] == 640)
        image = image[:-1] + f' src="/{fallback["url"]}" width="{fallback["width"]}" height="{fallback["height"]}" srcset="{srcset("mobile")}" sizes="{sizes["mobile"]}">'
        picture = f'<picture class="sl-campaign-picture"><source media="(min-width:721px)" srcset="{srcset("desktop")}" sizes="{sizes["desktop"]}">{image}</picture>'
        card = re.sub(r'<picture\b[^>]*>[\s\S]*?</picture>|<img\b[^>]*>', lambda _: picture, card, count=1)
        return card
    html = re.sub(r'<a id="campaign-card-'+str(campaign['productId'])+r'"[\s\S]*?</a>', replace_card, html, count=1)
    print(Path(campaign['image']).stem, 'mobile/desktop bytes @960:', *(prepared[k]['sources'][2]['bytes'] for k in ['mobile','desktop']))
(source / 'campaigns.json').write_text(json.dumps(campaigns,ensure_ascii=False,indent=2)+'\n')
(source / 'index.html').write_text(html.replace('/campaigns.js?v=speed-v54','/campaigns.js?v=carousel-v55').replace('/storefront.css?v=speed-v54','/storefront.css?v=carousel-v55'))
