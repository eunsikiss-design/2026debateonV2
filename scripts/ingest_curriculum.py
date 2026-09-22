"""Local text ingestion. pip install -r scripts/requirements-knowledge.txt
본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
HWP 5.0 spec: https://cdn.hancom.com/link/docs/한글문서파일형식_5.0_revision1.3.pdf
Text only: tables, formulas and physical HWP pagination require human review.
"""
import argparse, hashlib, json, re, struct, sys, unicodedata, zlib
from pathlib import Path
if (Path(__file__).parent / 'deps').exists():
    sys.path.insert(0, str(Path(__file__).parent / 'deps'))
import pdfplumber
import olefile

UNIT = 'Ⅱ. 사회 정의와 불평등'
CHAPTERS = ['정의의 의미와 필요성', '분배적 정의와 교정적 정의', '다양한 정의관의 특징과 적용', '다양한 불평등 현상', '정의로운 사회 실현을 위한 노력']
CONCEPTS = ['정의', '분배적 정의', '교정적 정의', '능력', '업적', '필요', '롤스', '노직', '차등의 원칙', '최소 수혜자', '무지의 베일', '자유주의', '공동체주의', '사회 불평등', '공간 불평등', '사회 계층', '사회 보장', '사회 보험', '공공 부조', '사회 서비스', '적극적 평등 실현 조치', '지역 격차', '응보', '예방', '칸트', '베카리아']

def normalize(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', text)).strip()

def hwp_units(file):
    with olefile.OleFileIO(file) as ole:
        header = ole.openstream('FileHeader').read()
        if not header.startswith(b'HWP Document File'):
            raise ValueError('Unsupported HWP signature')
        flags = struct.unpack_from('<I', header, 36)[0]
        if flags & 6:
            raise ValueError('Encrypted/distribution HWP is not supported')
        streams = sorted([s for s in ole.listdir() if len(s)==2 and s[0]=='BodyText' and s[1].startswith('Section')], key=lambda s:int(s[1][7:]))
        for stream in streams:
            data = ole.openstream(stream).read()
            if flags & 1:
                data = zlib.decompress(data, -15)
            pos, paragraphs = 0, []
            while pos < len(data):
                record = struct.unpack_from('<I', data, pos)[0]; pos += 4
                tag, size = record & 1023, record >> 20
                if size == 4095:
                    size = struct.unpack_from('<I', data, pos)[0]; pos += 4
                body = data[pos:pos+size]; pos += size
                if len(body)!=size:
                    raise ValueError('Truncated HWP record')
                if tag != 67:
                    continue
                chars, cursor = [], 0
                while cursor + 1 < len(body):
                    code = struct.unpack_from('<H', body, cursor)[0]
                    if code in {1,2,3,4,5,6,7,8,9,11,12,14,15,16,17,18,19,20,21,22,23}:
                        chars.append(' '); cursor += 16
                    elif code < 32:
                        chars.append(' '); cursor += 2
                    else:
                        chars.append(chr(code)); cursor += 2
                line = normalize(''.join(chars))
                if line: paragraphs.append(line)
            yield {'page':None, 'section':stream[1], 'raw':'\n'.join(paragraphs), 'printedPage':None}

def chunks(text, length=700, overlap=100):
    start = 0
    while start < len(text):
        end = min(len(text), start+length)
        if end < len(text):
            boundary = text.rfind(' ', start+length//2, end)
            if boundary > start: end = boundary
        yield start, end, text[start:end]
        if end == len(text): break
        start = end-overlap

def build(root):
    sources, cards, units, failures = [], [], [], []
    files = sorted([*root.glob('*.pdf'), *root.glob('*.hwp')])
    for file in files:
        sha = hashlib.sha256(file.read_bytes()).hexdigest()
        source_id = 'src_' + hashlib.sha256(file.name.encode()).hexdigest()[:16]
        kind = 'teacher-guide' if '지도서' in file.name else 'worksheet' if file.suffix=='.hwp' else 'glossary' if '용어' in file.name else 'textbook'
        audience = 'teacher' if kind in ('teacher-guide','worksheet') else 'student'
        source = dict(sourceId=source_id, fileName=file.name, documentTitle=file.stem, sha256=sha,
                      format=file.suffix[1:], category=kind, audience=audience, publisher='미래엔' if file.name.startswith('미래엔') else None,
                      year=None, unit=UNIT, extractionStatus='extracted', reviewStatus='pending', limitations=['표·수식·그림은 원문 대조 필요'])
        try:
            if file.suffix=='.pdf':
                with pdfplumber.open(file) as pdf:
                    source['pageCount'] = len(pdf.pages)
                    # Content-stream order prevents interleaved opposing columns.
                    extracted = [dict(page=i+1, section=None, raw=p.extract_text(use_text_flow=True) or '', printedPage=None) for i,p in enumerate(pdf.pages)]
            else:
                extracted = list(hwp_units(file)); source['pageCount'] = None
                source['limitations'].append('HWP 페이지 미확정 · 본문 구역 번호로 추적')
            chapter = None
            match = re.search(r'_2-([1-5])\.hwp$', file.name)
            if match: chapter = CHAPTERS[int(match[1])-1]
            empty_units = []
            for number, entry in enumerate(extracted, 1):
                if file.suffix=='.pdf': chapter = None
                # PDF headings can appear in tables of contents or refer to other
                # chapters. Leave their hierarchy partial until reviewed.
                text = normalize(entry['raw'])
                if len(text)<30: empty_units.append(number); continue
                unit_id = f'{source_id}_{number}'
                units.append(dict(unitId=unit_id, sourceId=source_id, page=entry['page'], section=entry['section'], text=text))
                for start,end,part in chunks(text):
                    chunk_id = 'chunk_'+hashlib.sha256(f'{sha}:{number}:{start}:{part}'.encode()).hexdigest()[:20]
                    concepts = [term for term in CONCEPTS if term.replace(' ','') in part.replace(' ','')]
                    location = f"PDF {entry['page']}쪽" if entry['page'] else f"HWP {entry['section']}"
                    cards.append(dict(cardId=chunk_id, chunkId=chunk_id, sourceId=source_id, unitId=unit_id, fileName=file.name,
                        documentTitle=file.stem, publisher=source['publisher'], year=None, unit=UNIT, chapter=chapter,
                        section=entry['section'], headingPath=[UNIT]+([chapter] if chapter else []), hierarchyStatus='partial',
                        page=entry['page'], printedPage=None, offsetStart=start, offsetEnd=end,
                        title=chapter or (concepts[0] if concepts else file.stem), topicId='all', category=kind,
                        audience=audience, summary=part[:200], detail=part, keyConcepts=concepts,
                        source=f'{file.name} · {location}', sourceHash=sha, verificationStatus='source_extracted', reviewStatus='pending',
                        recommendedFor=['evidence'], sourceUrl=f'/api/evidence/source/{source_id}'+(f"#page={entry['page']}" if entry['page'] else '')))
            source['emptyUnits']=empty_units
            source['chunkCount']=sum(c['sourceId']==source_id for c in cards)
            if not source['chunkCount']: raise ValueError('No usable text extracted')
        except Exception as error:
            cards = [c for c in cards if c['sourceId'] != source_id]
            units = [u for u in units if u['sourceId'] != source_id]
            source['chunkCount'] = 0
            source['extractionStatus']='failed'; failures.append({'file':file.name,'error':str(error)})
        sources.append(source)
    return dict(schemaVersion=1, extractionVersion='local-text-v2-flow', sources=sources, units=units, cards=cards, failures=failures)

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--root',type=Path,required=True); parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(); corpus=build(args.root)
    print(json.dumps({'sources':len(corpus['sources']),'units':len(corpus['units']),'chunks':len(corpus['cards']),'failures':corpus['failures']},ensure_ascii=False))
    if corpus['failures']: sys.exit(1)
    if not corpus['cards']: raise SystemExit('No usable source documents; existing corpus preserved')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    temporary = args.output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(corpus,ensure_ascii=False,indent=2),encoding='utf-8')
    temporary.replace(args.output)

