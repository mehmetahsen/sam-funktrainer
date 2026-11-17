#!/usr/bin/env python3
"""Decode the KETK32 script files (*.tks, *.tkd, *.tkl, *.tkp) of the original SAM-Trainer software
into readable text. Format notes: docs/original-software.md.

    pip install pefile
    python ketk32_decode.py <path to KEVisual32.dll> <script file>...

Token names are not stored in the script files; they are the string resources of KEVisual32.dll
(string id == token number), so the DLL from your own installation is required.
"""
import struct
import sys

import pefile

# Operator tokens that have no string resource; meaning assigned from context.
UNNAMED = {0x1B07: '<', 0x1B08: '<=', 0x2506: '!=', 0x2505: '&&', 0x2507: '&', 0x1F08: '||', 0x1F0A: '|', 0x2611: '!'}


def token_names(dll_path):
    pe = pefile.PE(dll_path)
    names = {}
    for rtype in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        if rtype.id != 6:  # RT_STRING
            continue
        for block in rtype.directory.entries:
            for lang in block.directory.entries:
                data = pe.get_data(lang.data.struct.OffsetToData, lang.data.struct.Size)
                pos = 0
                for k in range(16):
                    n = struct.unpack_from('<H', data, pos)[0]
                    pos += 2
                    if n:
                        names[(block.id - 1) * 16 + k] = data[pos:pos + 2 * n].decode('utf-16le')
                    pos += 2 * n
    names.update(UNNAMED)
    return names


def expression(buf, i, end, names):
    out = []
    while i < end:
        tok = struct.unpack_from('<H', buf, i)[0]
        i += 2
        if tok == 0x3600:  # double constant
            out.append(repr(struct.unpack_from('<d', buf, i)[0]))
            i += 8
        elif tok == 0x3601:  # long constant
            out.append(str(struct.unpack_from('<i', buf, i)[0]))
            i += 4
        elif tok in (0x3602, 0x1B01):  # sub-expression / string constant
            n = struct.unpack_from('<I', buf, i)[0]
            i += 4
            out.append('{' + expression(buf, i, i + n, names) + '}' if tok == 0x3602 else repr(buf[i:i + n].decode('latin1')))
            i += n
        elif tok in (0x1605, 0x232B):  # local numeric / string variable
            out.append(('v' if tok == 0x1605 else 's') + str(struct.unpack_from('<I', buf, i)[0]))
            i += 4
        elif tok == 0x1119:  # end of expression / argument separator
            out.append(')')
        else:
            out.append(names.get(tok, f'T{tok:04x}'))
    return ' '.join(out)


def dump(path, names):
    buf = open(path, 'rb').read()
    if buf[:6] != b'KETK32':
        raise SystemExit(f'{path}: not a KETK32 file')
    i = 0x85  # header is 0x7a bytes, then the 11-byte BOT record
    while i + 11 <= len(buf) and not buf.startswith(b'*Stringtable', i):
        tok, line, length, _flags = struct.unpack_from('<HIIB', buf, i)
        print(f'{i:05x} L{line:<5} {names.get(tok, hex(tok))} {expression(buf, i + 11, i + 11 + length, names)}')
        i += 11 + length


if __name__ == '__main__':
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    table = token_names(sys.argv[1])
    for script in sys.argv[2:]:
        print(f'===== {script}')
        dump(script, table)
