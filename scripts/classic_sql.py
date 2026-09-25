"""Reproducible stdlib extraction from the pinned CMaNGOS ClassicDB SQL dump.

This parses MySQL INSERT VALUES, not arbitrary SQL. Strings respect MySQL
backslash escapes, doubled quotes, commas, semicolons and embedded newlines.
It never executes SQL. Source records retain their original column names.
"""
from __future__ import annotations
import argparse, gzip, hashlib, json, re
from pathlib import Path
from collections import defaultdict

SOURCE_SHA256 = '4f92db520868ab4e566726f68b5b2e380ae781209beaf22237b4f7f04600d0c0'
SOURCE_COMMIT = '22b51464f1625f6ef6275771de1f5466c6f5d19e'
TOKEN = re.compile(r"\s*('(?:\\.|''|[^'\\])*'|NULL|0x[0-9A-Fa-f]+|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|[(),;])", re.S)
INSERT = re.compile(r'(?m)^INSERT INTO `([^`]+)`(?:\s*\(([^\n]*?)\))? VALUES\s*')
ESCAPES = {'0':'\0','b':'\b','n':'\n','r':'\r','t':'\t','Z':'\x1a'}

def scalar(token):
    if token == 'NULL': return None
    if token.startswith("'"):
        s=token[1:-1]; out=[]; i=0
        while i<len(s):
            if s[i]=='\\':
                i+=1; out.append(ESCAPES.get(s[i],s[i])); i+=1
            elif s[i]=="'" and i+1<len(s) and s[i+1]=="'": out.append("'"); i+=2
            else: out.append(s[i]); i+=1
        return ''.join(out)
    if token.startswith('0x'): return int(token,16)
    return float(token) if any(x in token for x in '.eE') else int(token)

def tuples_at(sql, position):
    row=None; expect='row'; need_value=False
    while True:
        m=TOKEN.match(sql,position)
        if not m: raise ValueError(f'Unsupported SQL VALUES token at {position}: {sql[position:position+80]!r}')
        token=m[1]; position=m.end()
        if token==';':
            if row is not None or expect=='row': raise ValueError('Incomplete INSERT')
            return
        if token=='(':
            if expect!='row': raise ValueError('Unexpected tuple start')
            row=[]; expect='value'; need_value=True
        elif token==')':
            if row is None or need_value: raise ValueError('Unexpected tuple end')
            yield row; row=None; expect='separator'
        elif token==',':
            if row is None:
                if expect!='separator': raise ValueError('Unexpected row separator')
                expect='row'
            else:
                if need_value: raise ValueError('Unexpected value separator')
                need_value=True
        else:
            if row is None or not need_value: raise ValueError('Unexpected scalar')
            row.append(scalar(token)); need_value=False

def read_sql(path, wanted=None):
    raw=Path(path).read_bytes()
    digest=hashlib.sha256(raw).hexdigest()
    if digest!=SOURCE_SHA256: raise ValueError(f'Archive SHA256 mismatch: {digest}')
    sql=gzip.decompress(raw).decode('utf-8')
    schemas={n:re.findall(r'^  `([^`]+)`',b,re.M) for n,b in re.findall(r'CREATE TABLE `([^`]+)` \((.*?)\) ENGINE=',sql,re.S)}
    tables=defaultdict(list)
    for m in INSERT.finditer(sql):
        name=m[1]
        if wanted is not None and name not in wanted: continue
        columns=re.findall(r'`([^`]+)`',m[2]) if m[2] else schemas[name]
        for row in tuples_at(sql,m.end()):
            if len(row)!=len(columns): raise ValueError(f'{name} columns {len(columns)} != values {len(row)}')
            tables[name].append(dict(zip(columns,row)))
    return schemas,tables

