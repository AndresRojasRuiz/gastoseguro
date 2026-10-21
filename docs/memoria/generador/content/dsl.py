# -*- coding: utf-8 -*-
"""Mini-lenguaje para escribir la memoria: cada función devuelve un bloque."""


def H1(text):
    return ('h1', text)


def H2(text):
    return ('h2', text)


def H3(text):
    return ('h3', text)


def H3A(text):
    """Subtítulo de anexo (no numerado ni incluido en el índice)."""
    return ('h3a', text)


def P(text):
    return ('p', text)


def PB(text):
    """Párrafo que se mantiene con el siguiente (introduce una lista o tabla)."""
    return ('pb', text)


def BOX(text):
    return ('box', text)


def UL(*items):
    return ('ul', list(items))


def OL(*items):
    return ('ol', list(items))


def T(key, caption, header, rows, widths=None, source='Elaboración propia.', size=19, align=None):
    return ('table', {'key': key, 'caption': caption, 'header': header, 'rows': rows, 'widths': widths, 'source': source, 'size': size, 'align': align})


def F(key, img, caption, width=15.5, source='Elaboración propia.', max_height=20.5):
    return ('figure', {'key': key, 'img': img, 'caption': caption, 'width': width, 'source': source, 'max_height': max_height})


def CODE(text):
    return ('code', text)


def REF(text):
    return ('ref', text)
