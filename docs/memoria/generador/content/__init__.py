# -*- coding: utf-8 -*-
from . import anexos, c1, c2, c3, c4a, c4b, c4c, c4d, c4e, c5, refs
from .front import COVER, FRONT

BLOCKS = (
    c1.BLOCKS
    + c2.BLOCKS
    + c3.BLOCKS
    + c4a.BLOCKS
    + c4b.BLOCKS
    + c4c.BLOCKS
    + c4d.BLOCKS
    + c4e.BLOCKS
    + c5.BLOCKS
    + refs.BLOCKS
    + anexos.BLOCKS
)

__all__ = ['BLOCKS', 'COVER', 'FRONT']
