# -*- coding: utf-8 -*-
"""Genera la memoria del TFE a partir de la plantilla oficial de UNIR.

Conserva intactos la portada, los encabezados/pies, los estilos, la numeración y los saltos
de sección de la plantilla, y sustituye el contenido por los bloques definidos en content/.
"""
import os
import re
import shutil
import struct
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from content import BLOCKS, FRONT, COVER  # noqa: E402

TEMPLATE_DIR = sys.argv[1]
OUTPUT = sys.argv[2]
IMG_DIR = sys.argv[3]
WORK = os.path.join(HERE, 'build')

TEXT_WIDTH = 9061  # twips (ancho útil de la plantilla)


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


# ------------------------------------------------------------------------------------------
# Referencias cruzadas {fig:clave} / {tab:clave}
# ------------------------------------------------------------------------------------------
NUMBERS = {}


def assign_numbers(blocks):
    counters = {'fig': 0, 'tab': 0}
    for block in blocks:
        kind = block[0]
        if kind in ('table', 'figure'):
            prefix = 'tab' if kind == 'table' else 'fig'
            counters[prefix] += 1
            NUMBERS[f'{prefix}:{block[1]["key"]}'] = counters[prefix]


def resolve(text):
    def repl(match):
        key = match.group(1)
        if key not in NUMBERS:
            raise KeyError(f'Referencia no definida: {key}')
        label = 'Tabla' if key.startswith('tab:') else 'Figura'
        return f'{label} {NUMBERS[key]}'
    return re.sub(r'\{((?:fig|tab):[a-z0-9_-]+)\}', repl, text)


# ------------------------------------------------------------------------------------------
# Runs y párrafos
# ------------------------------------------------------------------------------------------
def rpr(b=False, i=False, code=False, sz=None, color=None, highlight=None, extra=''):
    out = ''
    if code:
        out += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>'
    if b:
        out += '<w:b/><w:bCs/>'
    if i:
        out += '<w:i/><w:iCs/>'
    if color:
        out += f'<w:color w:val="{color}"/>'
    if sz:
        out += f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>'
    if highlight:
        out += f'<w:highlight w:val="{highlight}"/>'
    out += extra
    return f'<w:rPr>{out}</w:rPr>' if out else ''


def run(text, **kw):
    parts = text.split('\t')
    xml = ''
    for index, part in enumerate(parts):
        if index:
            xml += f'<w:r>{rpr(**kw)}<w:tab/></w:r>'
        if part:
            xml += f'<w:r>{rpr(**kw)}<w:t xml:space="preserve">{esc(part)}</w:t></w:r>'
    return xml


TOKEN = re.compile(r'(\*\*.+?\*\*|`[^`]+?`|\*[^*\s][^*]*?\*|\[\[.+?\]\])')


def inline(text, sz=None, base_b=False, base_i=False, color=None):
    text = resolve(text)
    xml = ''
    for piece in TOKEN.split(text):
        if not piece:
            continue
        if piece.startswith('**') and piece.endswith('**'):
            xml += inline_inner(piece[2:-2], sz, True, base_i, color)
        elif piece.startswith('`') and piece.endswith('`'):
            xml += run(piece[1:-1], code=True, sz=(sz - 2 if sz else 21), b=base_b, i=base_i, color=color)
        elif piece.startswith('[[') and piece.endswith(']]'):
            xml += run(piece[2:-2], sz=sz, b=base_b, i=base_i, highlight='yellow')
        elif piece.startswith('*') and piece.endswith('*') and len(piece) > 2:
            xml += inline_inner(piece[1:-1], sz, base_b, True, color)
        else:
            xml += run(piece, sz=sz, b=base_b, i=base_i, color=color)
    return xml


def inline_inner(text, sz, b, i, color):
    xml = ''
    for piece in re.split(r'(`[^`]+?`|\*[^*\s][^*]*?\*)', text):
        if not piece:
            continue
        if piece.startswith('`'):
            xml += run(piece[1:-1], code=True, sz=(sz - 2 if sz else 21), b=b, i=i, color=color)
        elif piece.startswith('*') and piece.endswith('*') and len(piece) > 2:
            xml += run(piece[1:-1], sz=sz, b=b, i=True, color=color)
        else:
            xml += run(piece, sz=sz, b=b, i=i, color=color)
    return xml


def ppr(style=None, keep_next=False, keep_lines=False, page_break=False, num=None, spacing=None, ind=None, jc=None, run_props=''):
    out = ''
    if style:
        out += f'<w:pStyle w:val="{style}"/>'
    if keep_next:
        out += '<w:keepNext/>'
    if keep_lines:
        out += '<w:keepLines/>'
    if page_break:
        out += '<w:pageBreakBefore/>'
    if num:
        out += f'<w:numPr><w:ilvl w:val="{num[1]}"/><w:numId w:val="{num[0]}"/></w:numPr>'
    if spacing:
        out += f'<w:spacing {spacing}/>'
    if ind:
        out += f'<w:ind {ind}/>'
    if jc:
        out += f'<w:jc w:val="{jc}"/>'
    if run_props:
        out += f'<w:rPr>{run_props}</w:rPr>'
    return f'<w:pPr>{out}</w:pPr>' if out else ''


def para(content_xml, **kw):
    return f'<w:p>{ppr(**kw)}{content_xml}</w:p>'


# ------------------------------------------------------------------------------------------
# Hipervínculos en las referencias (APA 7: enlaces activos, sin guiones de partición)
# ------------------------------------------------------------------------------------------
LINKS = []  # (rid, url)
NB_HYPHEN = chr(0x2011)  # guion no separable
ZW_SPACE = chr(0x200B)  # espacio de anchura cero (oportunidad de corte)
URL_RE = re.compile(r'https?://[^\s]+[^\s.,;)]')


def url_display(url):
    """Texto visible de la URL: guiones no separables (U+2011) para que Word no la parta en
    un guion y la confunda con una palabra dividida, y puntos de corte invisibles (U+200B)
    antes de cada barra, como recomienda APA 7. El destino del enlace no se modifica."""
    scheme, rest = url.split('://', 1)
    rest = rest.replace('-', NB_HYPHEN).replace('/', ZW_SPACE + '/')
    return f'{scheme}://{rest}'


def hyperlink(url):
    rid = f'rIdLink{len(LINKS) + 1}'
    LINKS.append((rid, url))
    # w:rStyle debe ser el primer elemento de w:rPr.
    return (
        f'<w:hyperlink r:id="{rid}" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>'
        f'<w:t xml:space="preserve">{esc(url_display(url))}</w:t></w:r></w:hyperlink>'
    )


def inline_with_links(text):
    xml = ''
    position = 0
    for match in URL_RE.finditer(text):
        xml += inline(text[position:match.start()])
        xml += hyperlink(match.group(0))
        position = match.end()
    return xml + inline(text[position:])


def page_break_para():
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


# ------------------------------------------------------------------------------------------
# Listas numeradas (cada lista reinicia la numeración)
# ------------------------------------------------------------------------------------------
NEW_NUMS = []
NEXT_NUM_ID = [100]


def new_numbered_list():
    num_id = NEXT_NUM_ID[0]
    NEXT_NUM_ID[0] += 1
    NEW_NUMS.append(f'<w:num w:numId="{num_id}"><w:abstractNumId w:val="3"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>')
    return num_id


# ------------------------------------------------------------------------------------------
# Campos (SEQ, TOC)
# ------------------------------------------------------------------------------------------
def field(instr, placeholder, run_props=''):
    rp = f'<w:rPr>{run_props}</w:rPr>' if run_props else ''
    rp_result = f'<w:rPr><w:noProof/>{run_props}</w:rPr>'
    return (
        f'<w:r>{rp}<w:fldChar w:fldCharType="begin"/></w:r>'
        f'<w:r>{rp}<w:instrText xml:space="preserve"> {esc(instr)} </w:instrText></w:r>'
        f'<w:r>{rp}<w:fldChar w:fldCharType="separate"/></w:r>'
        f'<w:r>{rp_result}<w:t xml:space="preserve">{esc(placeholder)}</w:t></w:r>'
        f'<w:r>{rp}<w:fldChar w:fldCharType="end"/></w:r>'
    )


def caption(kind, number, title):
    sz = '<w:sz w:val="24"/><w:szCs w:val="24"/>'
    content = (
        f'<w:r><w:rPr>{sz}</w:rPr><w:t xml:space="preserve">{kind} </w:t></w:r>'
        + field(f'SEQ {kind} \\* ARABIC', str(number), sz)
        + f'<w:r><w:rPr>{sz}</w:rPr><w:t xml:space="preserve">. </w:t></w:r>'
        + f'<w:r><w:rPr><w:b w:val="0"/><w:bCs w:val="0"/><w:i/><w:iCs/>{sz}</w:rPr><w:t xml:space="preserve">{esc(resolve(title))}</w:t></w:r>'
    )
    return para(content, style='Caption', keep_next=True)


def source_para(text):
    return para(inline(f'Fuente: {text}'), style='Piedefoto-tabla', run_props='<w:lang w:val="es-ES"/>')


def toc_paragraph(instr, placeholder):
    content = field(instr, placeholder)
    return para(content, style='TOC1', spacing='w:before="60" w:after="60"')


# ------------------------------------------------------------------------------------------
# Tablas
# ------------------------------------------------------------------------------------------
def cell_paragraphs(text, header=False, sz=19, align='left', keep_next=False):
    lines = str(text).split('\n')
    out = ''
    for line in lines:
        bullet = line.startswith('• ')
        content = inline(line[2:] if bullet else line, sz=sz, base_b=header, color='FFFFFF' if header else None)
        if bullet:
            content = run('• ', sz=sz) + content
        out += para(content, style='TextoTabla', jc=align, keep_next=keep_next, ind='w:left="170" w:hanging="170"' if bullet else None)
    return out


def table_xml(spec):
    header = spec['header']
    rows = spec['rows']
    widths = spec.get('widths') or [1] * len(header)
    sz = spec.get('size', 19)
    total = sum(widths)
    cols = [int(TEXT_WIDTH * w / total) for w in widths]
    cols[-1] = TEXT_WIDTH - sum(cols[:-1])
    aligns = spec.get('align') or ['left'] * len(header)
    grid = ''.join(f'<w:gridCol w:w="{c}"/>' for c in cols)
    xml = (
        '<w:tbl><w:tblPr><w:tblStyle w:val="GridTable4-Accent1"/>'
        f'<w:tblW w:w="{TEXT_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/>'
        '<w:tblCellMar><w:left w:w="85" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar>'
        '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>'
        f'</w:tblPr><w:tblGrid>{grid}</w:tblGrid>'
    )
    xml += '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>'
    for c, h in zip(cols, header):
        xml += f'<w:tc><w:tcPr><w:tcW w:w="{c}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>{cell_paragraphs(h, True, sz, keep_next=True)}</w:tc>'
    xml += '</w:tr>'
    # Sin filas huérfanas: las tablas cortas no se parten; en las largas, la cabecera queda unida
    # a las dos primeras filas y las tres últimas filas quedan unidas a la línea de fuente.
    total_rows = len(rows)
    for index, row in enumerate(rows):
        last = total_rows <= 5 or index < 2 or index >= total_rows - 3
        xml += '<w:tr><w:trPr><w:cantSplit/></w:trPr>'
        for c, value, align in zip(cols, row, aligns):
            xml += f'<w:tc><w:tcPr><w:tcW w:w="{c}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>{cell_paragraphs(value, False, sz, align, keep_next=last)}</w:tc>'
        xml += '</w:tr>'
    xml += '</w:tbl>'
    return xml


# ------------------------------------------------------------------------------------------
# Imágenes
# ------------------------------------------------------------------------------------------
IMAGES = []  # (rid, nombre_en_media, ruta_origen)
DOCPR = [5200]


def png_size(path):
    with open(path, 'rb') as handle:
        data = handle.read(24)
    return struct.unpack('>II', data[16:24])


def image_paragraph(filename, width_cm, max_height_cm=20.5):
    path = os.path.join(IMG_DIR, filename)
    width_px, height_px = png_size(path)
    cx = int(width_cm * 360000)
    cy = int(cx * height_px / width_px)
    if cy > max_height_cm * 360000:
        cy = int(max_height_cm * 360000)
        cx = int(cy * width_px / height_px)
    rid = f'rIdImg{len(IMAGES) + 1}'
    media = f'tfe_{len(IMAGES) + 1:02d}.png'
    IMAGES.append((rid, media, path))
    DOCPR[0] += 1
    pid = DOCPR[0]
    drawing = (
        '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
        f'<wp:extent cx="{cx}" cy="{cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
        f'<wp:docPr id="{pid}" name="Figura {pid}" descr="{esc(filename)}"/>'
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        f'<pic:nvPicPr><pic:cNvPr id="{pid}" name="{media}"/><pic:cNvPicPr/></pic:nvPicPr>'
        f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="6350"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></pic:spPr>'
        '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>'
    )
    return para(f'<w:r>{drawing}</w:r>', jc='center', keep_next=True, spacing='w:before="60" w:after="60" w:line="240" w:lineRule="auto"')


# ------------------------------------------------------------------------------------------
# Renderizado de bloques
# ------------------------------------------------------------------------------------------
def heading(style, text, page_break=False):
    # La plantilla define una sangría francesa de 432 twips para el nivel 2, insuficiente para
    # números como «2.10.»; se usa la misma que en el nivel 3 para separar número y texto.
    ind = 'w:left="709" w:hanging="709"' if style == 'Heading2' else None
    return para(run(text, extra='<w:caps w:val="0"/>' if style != 'Heading3' else ''), style=style, page_break=page_break, ind=ind)


def render(blocks, first_h1_no_break=True):
    xml = ''
    first_h1 = True
    for block in blocks:
        kind = block[0]
        if kind == 'h1':
            xml += heading('Heading1', block[1], page_break=not (first_h1 and first_h1_no_break))
            first_h1 = False
        elif kind == 'h2':
            xml += heading('Heading2', block[1])
        elif kind == 'h3':
            xml += heading('Heading3', block[1])
        elif kind == 'h3a':
            xml += para(run(block[1]), style='SubtituloAnexo')
        elif kind == 'h1u':
            xml += para(run(block[1]), style='Ttulo1sinnumerar', page_break=True)
        elif kind == 'anexo':
            xml += para(run(block[1]), style='Anexo', page_break=True)
        elif kind == 'idx':
            xml += para(run(block[1]), style='Ttulondices', page_break=block[2] if len(block) > 2 else True)
        elif kind == 'idxsub':
            xml += para(run(block[1]), style='Ttulondices', keep_next=True, run_props='<w:sz w:val="28"/><w:szCs w:val="28"/>')
        elif kind == 'p':
            xml += para(inline(block[1]))
        elif kind == 'pb':
            xml += para(inline(block[1]), keep_next=True)
        elif kind == 'box':
            xml += para(inline(block[1]), style='CuadroCmoestudiaryReferencias')
        elif kind == 'ul':
            for item in block[1]:
                level = 1 if item.startswith('  ') else 0
                xml += para(inline(item.strip()), style='ListParagraph', num=(5, level), ind=('w:left="714" w:hanging="357"' if level == 0 else 'w:left="1134" w:hanging="357"'), spacing='w:before="40" w:after="40"')
        elif kind == 'ol':
            num_id = new_numbered_list()
            for item in block[1]:
                xml += para(inline(item), style='ListParagraph', num=(num_id, 0), ind='w:left="714" w:hanging="357"', spacing='w:before="40" w:after="40"')
        elif kind == 'table':
            spec = block[1]
            xml += caption('Tabla', NUMBERS[f'tab:{spec["key"]}'], spec['caption'])
            xml += table_xml(spec)
            xml += source_para(spec.get('source', 'Elaboración propia.'))
        elif kind == 'figure':
            spec = block[1]
            xml += caption('Figura', NUMBERS[f'fig:{spec["key"]}'], spec['caption'])
            xml += image_paragraph(spec['img'], spec.get('width', 15.5), spec.get('max_height', 20.5))
            xml += source_para(spec.get('source', 'Elaboración propia.'))
        elif kind == 'code':
            lines = block[1].strip('\n').split('\n')
            for index, line in enumerate(lines):
                xml += para(run(line if line else ' '), style='Codigo', keep_next=index < len(lines) - 1)
        elif kind == 'ref':
            xml += para(inline_with_links(block[1]), style='Referenciasbibliogrficas', jc='left')
        elif kind == 'raw':
            special = {
                'TOC_CONTENTS': ('TOC \\o "1-3" \\h \\z \\u', 'Actualice el índice (clic derecho > Actualizar campo).'),
                'TOC_FIGURES': ('TOC \\h \\z \\c "Figura"', 'Actualice el índice de figuras.'),
                'TOC_TABLES': ('TOC \\h \\z \\c "Tabla"', 'Actualice el índice de tablas.'),
            }
            if block[1] in special:
                xml += toc_paragraph(*special[block[1]])
            else:
                xml += block[1]
        elif kind == 'pagebreak':
            xml += page_break_para()
        else:
            raise ValueError(f'Bloque desconocido: {kind}')
    return xml


# ------------------------------------------------------------------------------------------
# Plantilla: localización de los elementos de primer nivel del cuerpo
# ------------------------------------------------------------------------------------------
def body_children(doc):
    body_start = doc.index('<w:body>') + len('<w:body>')
    body_end = doc.rindex('</w:body>')
    spans = []
    depth = 0
    start = None
    for match in re.finditer(r'<(/?)([\w:]+)([^>]*?)(/?)>', doc[body_start:body_end]):
        closing, _tag, _attrs, selfclosing = match.groups()
        pos = body_start + match.start()
        end = body_start + match.end()
        if closing:
            depth -= 1
            if depth == 0:
                spans.append((start, end))
        elif selfclosing:
            if depth == 0:
                spans.append((pos, end))
        else:
            if depth == 0:
                start = pos
            depth += 1
    return body_start, body_end, spans


STYLES_EXTRA = (
    '<w:style w:type="paragraph" w:customStyle="1" w:styleId="SubtituloAnexo"><w:name w:val="Subtítulo anexo"/>'
    '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/>'
    '<w:jc w:val="left"/></w:pPr><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:b/><w:bCs/>'
    '<w:color w:val="0098CD"/></w:rPr></w:style>'
    '<w:style w:type="paragraph" w:customStyle="1" w:styleId="TextoTabla"><w:name w:val="Texto tabla"/>'
    '<w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="30" w:after="30" w:line="240" w:lineRule="auto"/>'
    '<w:jc w:val="left"/></w:pPr><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>'
    '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Codigo"><w:name w:val="Código fuente"/>'
    '<w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepLines/>'
    '<w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="0098CD"/></w:pBdr>'
    '<w:shd w:val="clear" w:color="auto" w:fill="F3F6F9"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>'
    '<w:ind w:left="284"/><w:jc w:val="left"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>'
    '<w:noProof/><w:sz w:val="17"/><w:szCs w:val="17"/><w:lang w:val="en-US"/></w:rPr></w:style>'
)


def compact_index_styles(styles):
    """Interlineado compacto en los índices (TOC y tablas de figuras)."""
    spacing = '<w:spacing w:before="0" w:after="40" w:line="264" w:lineRule="auto"/>'
    for style_id in ('TOC1', 'TOC2', 'TOC3', 'TableofFigures'):
        pattern = re.compile(r'(<w:style [^>]*w:styleId="' + style_id + r'"[^>]*>)(.*?)(</w:style>)', re.S)
        match = pattern.search(styles)
        if not match:
            continue
        body = match.group(2)
        if '<w:pPr>' in body:
            body = body.replace('<w:pPr>', '<w:pPr>' + spacing, 1)
        elif '<w:rPr>' in body:
            body = body.replace('<w:rPr>', '<w:pPr>' + spacing + '</w:pPr><w:rPr>', 1)
        else:
            body = body + '<w:pPr>' + spacing + '</w:pPr>'
        styles = styles[:match.start()] + match.group(1) + body + match.group(3) + styles[match.end():]
    return styles


def replace_paragraph_text(xml, old, new):
    """Sustituye el texto de los párrafos cuyo texto concatenado coincide con 'old'."""
    def repl(match):
        paragraph = match.group(0)
        texts = re.findall(r'<w:t(?: [^>]*)?>([^<]*)</w:t>', paragraph)
        if ''.join(texts).strip() != old:
            return paragraph
        first = [True]

        def sub_t(m):
            if first[0]:
                first[0] = False
                return f'<w:t xml:space="preserve">{esc(new)}</w:t>'
            return '<w:t></w:t>'
        return re.sub(r'<w:t(?: [^>]*)?>[^<]*</w:t>', sub_t, paragraph)
    return re.sub(r'<w:p[ >].*?</w:p>', repl, xml, flags=re.S)


def fill_empty_cell(cell_xml, text, highlight=None):
    rp = '<w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:cs="Tahoma"/>' + (f'<w:highlight w:val="{highlight}"/>' if highlight else '') + '<w:sz w:val="24"/><w:szCs w:val="28"/></w:rPr>'
    return cell_xml.replace('</w:pPr></w:p>', f'</w:pPr><w:r>{rp}<w:t xml:space="preserve">{esc(text)}</w:t></w:r></w:p>', 1)


def build():
    if os.path.exists(WORK):
        shutil.rmtree(WORK)
    shutil.copytree(TEMPLATE_DIR, WORK)
    trash = os.path.join(WORK, '[trash]')
    if os.path.exists(trash):
        shutil.rmtree(trash)

    doc_path = os.path.join(WORK, 'word', 'document.xml')
    with open(doc_path, encoding='utf-8') as handle:
        doc = handle.read()
    body_start, body_end, spans = body_children(doc)

    def child(i):
        return doc[spans[i][0]:spans[i][1]]

    # Portada (elementos 0..19)
    # Se omiten dos párrafos vacíos para compensar un título de tres líneas.
    cover = ''.join(child(i) for i in range(20) if i not in (10, 11))
    cover = replace_paragraph_text(cover, 'Título del Trabajo Fin de Estudios', COVER['title'])
    cover = replace_paragraph_text(cover, 'Por orden alfabético, el nombre de todos los integrantes del TFE en grupo', COVER['authors'])
    table_start = cover.index('<w:tbl>')
    table_end = cover.index('</w:tbl>') + len('</w:tbl>')
    table = cover[table_start:table_end]
    rows = re.split(r'(?=<w:tr[ >])', table)
    # rows[0] = tblPr/grid, rows[1..4] = filas
    for row_index, value, mark in ((2, COVER['type'], None), (3, COVER['director'], 'yellow'), (4, COVER['date'], 'yellow' if COVER.get('date_placeholder') else None)):
        cells = re.split(r'(?=<w:tc[ >])', rows[row_index])
        cells[2] = fill_empty_cell(cells[2], value, mark)
        rows[row_index] = ''.join(cells)
    table = ''.join(rows)
    cover = cover[:table_start] + table + cover[table_end:]

    section_break = child(93)
    final_sect = child(len(spans) - 1)
    assert final_sect.startswith('<w:sectPr'), 'No se encontró el sectPr final'
    assert '<w:sectPr' in section_break, 'No se encontró el salto de sección de la parte preliminar'

    assign_numbers(FRONT + BLOCKS)
    front_xml = render(FRONT, first_h1_no_break=False)
    body_xml = render(BLOCKS, first_h1_no_break=True)

    new_doc = doc[:body_start] + cover + front_xml + section_break + body_xml + final_sect + doc[body_end:]
    with open(doc_path, 'w', encoding='utf-8') as handle:
        handle.write(new_doc)

    # Estilos adicionales
    styles_path = os.path.join(WORK, 'word', 'styles.xml')
    with open(styles_path, encoding='utf-8') as handle:
        styles = handle.read()
    styles = styles.replace('</w:styles>', STYLES_EXTRA + '</w:styles>')
    styles = compact_index_styles(styles)
    with open(styles_path, 'w', encoding='utf-8') as handle:
        handle.write(styles)

    # Numeración de listas ordenadas
    numbering_path = os.path.join(WORK, 'word', 'numbering.xml')
    with open(numbering_path, encoding='utf-8') as handle:
        numbering = handle.read()
    numbering = numbering.replace('<w:numIdMacAtCleanup', ''.join(NEW_NUMS) + '<w:numIdMacAtCleanup')
    with open(numbering_path, 'w', encoding='utf-8') as handle:
        handle.write(numbering)

    # Imágenes y relaciones
    rels_path = os.path.join(WORK, 'word', '_rels', 'document.xml.rels')
    with open(rels_path, encoding='utf-8') as handle:
        rels = handle.read()
    extra = ''
    for rid, media, source in IMAGES:
        shutil.copyfile(source, os.path.join(WORK, 'word', 'media', media))
        extra += f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{media}"/>'
    for rid, url in LINKS:
        extra += f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="{esc(url)}" TargetMode="External"/>'
    rels = rels.replace('</Relationships>', extra + '</Relationships>')
    with open(rels_path, 'w', encoding='utf-8') as handle:
        handle.write(rels)

    # Encabezados
    for name in ('header1.xml', 'header2.xml'):
        path = os.path.join(WORK, 'word', name)
        with open(path, encoding='utf-8') as handle:
            header = handle.read()
        header = replace_paragraph_text(header, 'Nombre y apellidos de los estudiantes', COVER['header_authors'])
        header = replace_paragraph_text(header, 'Nombre y apellidos del estudiante', COVER['header_authors'])
        header = replace_paragraph_text(header, 'Título del Trabajo Fin de Estudios', COVER['header_title'])
        with open(path, 'w', encoding='utf-8') as handle:
            handle.write(header)

    # Propiedades del documento
    core_path = os.path.join(WORK, 'docProps', 'core.xml')
    with open(core_path, encoding='utf-8') as handle:
        core = handle.read()
    core = re.sub(r'<dc:title>.*?</dc:title>|<dc:title/>', f'<dc:title>{esc(COVER["header_title"])}</dc:title>', core)
    core = re.sub(r'<dc:creator>.*?</dc:creator>', f'<dc:creator>{esc(COVER["authors"])}</dc:creator>', core)
    with open(core_path, 'w', encoding='utf-8') as handle:
        handle.write(core)

    # Empaquetado
    if os.path.exists(OUTPUT):
        os.remove(OUTPUT)
    with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as archive:
        content_types = os.path.join(WORK, '[Content_Types].xml')
        archive.write(content_types, '[Content_Types].xml')
        for root, _dirs, files in os.walk(WORK):
            for file in files:
                full = os.path.join(root, file)
                arc = os.path.relpath(full, WORK).replace(os.sep, '/')
                if arc == '[Content_Types].xml':
                    continue
                archive.write(full, arc)
    print(f'Documento generado: {OUTPUT}')
    print(f'Figuras: {sum(1 for k in NUMBERS if k.startswith("fig:"))} · Tablas: {sum(1 for k in NUMBERS if k.startswith("tab:"))} · Imágenes: {len(IMAGES)} · Enlaces: {len(LINKS)}')


if __name__ == '__main__':
    build()
