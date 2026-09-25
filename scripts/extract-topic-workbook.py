"""Read exact cell text from the supplied workbook without modifying it."""
import json
import pathlib
import posixpath
import sys
import zipfile
import xml.etree.ElementTree as ET

source, destination = map(pathlib.Path, sys.argv[1:3])
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(source) as archive:
    workbook = ET.fromstring(archive.read('xl/workbook.xml'))
    sheets = workbook.find('s:sheets', ns)
    sheet = next(s for s in sheets if s.attrib['name'] == '20대 정예논제 총괄 총람')
    rel_id = sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
    rels = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
    target = next(r.attrib['Target'] for r in rels if r.attrib['Id'] == rel_id)
    target = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
    shared = []
    if 'xl/sharedStrings.xml' in archive.namelist():
        for item in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', ns):
            shared.append(''.join(t.text or '' for t in item.findall('.//s:t', ns)))
    data = []
    for row in ET.fromstring(archive.read(target)).findall('s:sheetData/s:row', ns):
        cells = {}
        for cell in row.findall('s:c', ns):
            address = cell.attrib['r']
            kind = cell.attrib.get('t')
            value = cell.find('s:v', ns)
            if kind == 's':
                text = shared[int(value.text)]
            elif kind == 'inlineStr':
                text = ''.join(t.text or '' for t in cell.findall('.//s:t', ns))
            else:
                text = value.text if value is not None else ''
            cells[''.join(c for c in address if c.isalpha())] = text
        data.append({'row': int(row.attrib['r']), 'cells': cells})
result = {'workbook': source.name, 'sheet': sheet.attrib['name'], 'rows': data}
destination.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'sheet': result['sheet'], 'rows': len(data), 'headerRows': data[:2], 'maxH': max(len(r['cells'].get('H', '')) for r in data)}, ensure_ascii=False, indent=2))
