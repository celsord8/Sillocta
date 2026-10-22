"""Subset the approved fonts losslessly; requires fontTools with WOFF2 support.

Every supported character is verified at the original variable-weight extremes
and default against the original outlines and advances before encoding.
The full original font files remain the fallback for all other characters.
"""
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from pathlib import Path
import io, base64, json, hashlib, string
root=Path(__file__).resolve().parent.parent
corpus=''.join(p.read_text() for p in (root/'source').iterdir() if p.suffix in ['.html','.js','.css','.json'])
characters=string.ascii_letters+string.digits+string.punctuation+'ÀÁÂÃÇÉÊÍÓÔÕÚàáâãçéêíóôõú · — ©'+corpus
fonts=[]
for original,family,style,weights in [('font-d80df8ff5aecd299.woff2','Cormorant Garamond','normal','300 600'),('font-06b16db7a969135d.woff2','Montserrat','normal','200 600'),('font-6f2f5c3b1abc3d0b.woff2','Cormorant Garamond','italic','300 600')]:
 path=root/'source/assets/responsive'/original; originalfont=TTFont(path); font=TTFont(path); font.recalcTimestamp=False
 options=subset.Options(); options.layout_features=['*']; options.hinting=True; options.name_IDs=['*']; options.name_languages=['*']; options.name_legacy=True
 sub=subset.Subsetter(options=options); sub.populate(text=characters); sub.subset(font); data=io.BytesIO(); font.save(data); raw=data.getvalue(); optimized=TTFont(io.BytesIO(raw))
 cmap=optimized.getBestCmap(); oldmap=originalfont.getBestCmap()
 axis=next(a for a in font['fvar'].axes if a.axisTag=='wght')
 levels=sorted(set([float(axis.minValue),float(axis.defaultValue),float(axis.maxValue)]+[weight for weight in range(100,901,100) if axis.minValue<=weight<=axis.maxValue]))
 for level in levels:
  oldglyphs=originalfont.getGlyphSet(location={'wght':level}); newglyphs=optimized.getGlyphSet(location={'wght':level})
  for cp,name in cmap.items():
   p=DecomposingRecordingPen(oldglyphs); q=DecomposingRecordingPen(newglyphs); oldglyphs[oldmap[cp]].draw(p); newglyphs[name].draw(q)
   assert p.value==q.value,(original,cp,level,'outline changed')
   assert oldglyphs[oldmap[cp]].width==newglyphs[name].width,(original,cp,level,'width changed')
 digest=hashlib.sha256(raw).hexdigest(); url='/assets/responsive/opening-'+digest[:16]+'.woff2'
 fonts.append(dict(original='/assets/responsive/'+original,family=family,style=style,weight=weights,url=url,sha256=digest,unicodeRange=','.join('U+%X'%cp for cp in sorted(cmap)),data=base64.b64encode(raw).decode()))
 print(original,path.stat().st_size,'->',len(raw),'glyphs verified',len(cmap),'at',levels)
module='''// Original typefaces, subset without changing glyph outlines, widths, hints or axes.
// The complete original font faces remain available for every other character.
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
const fonts=FONTS;
export function openingFontStyles(output){
 return fonts.map(font=>{
  const bytes=Buffer.from(font.data,'base64');
  if(createHash('sha256').update(bytes).digest('hex')!==font.sha256)throw Error('Invalid opening font');
  writeFileSync(path.join(output,font.url.slice(1)),bytes);
  return '@font-face{font-family:"'+font.family+'";font-style:'+font.style+';font-weight:'+font.weight+';font-display:swap;src:url('+font.url+') format("woff2");unicode-range:'+font.unicodeRange+'}';
 }).join('');
}
export function openingFontPreloads(html){
 for(const font of fonts)html=html.replaceAll('href="'+font.original+'"','href="'+font.url+'"');
 return html;
}
'''.replace('FONTS',json.dumps(fonts,separators=(',',':')))
(root/'scripts/opening-fonts.mjs').write_text(module)
