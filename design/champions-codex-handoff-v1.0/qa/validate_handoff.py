"""Design artifact consistency checks; NOT an application/game accuracy test."""
from pathlib import Path
import json, csv, re, yaml, hashlib
root=Path(__file__).resolve().parent.parent
api=yaml.safe_load((root/'contracts/openapi-v1.2.yaml').read_text(encoding='utf-8'))
assert api['openapi'].startswith('3.')
paths=api['paths']
assert all('shares' not in p for p in paths), 'Share paths must not be in API'
assert '/api/v1/catalog/{kind}' in paths
assert '/api/v1/rankings/active' in paths
assert '/api/v1/calculations' in paths
schemas=api['components']['schemas']
assert not any('share' in k.lower() for k in schemas), 'Share-specific schemas must not exist'
b=schemas['Build']
assert b['properties']['natureId']['type']=='string'
assert 'natureId' in b['required']
assert 'isMega' not in b['properties']
assert 'pokemonFormId' in b['required']
assert schemas['SavedInputSnapshot']['oneOf'][0]['properties']['payloadSchemaVersion']['const']==1
assert schemas['SavedInputSnapshot']['oneOf'][1]['properties']['payloadSchemaVersion']['const']==1

def visit(v):
 if isinstance(v,dict):
  for k,x in v.items():
   if k=='$ref' and isinstance(x,str) and x.startswith('#/'):
    node=api
    for part in x[2:].split('/'):
     node=node[part.replace('~1','/').replace('~0','~')]
   else: visit(x)
 elif isinstance(v,list):
  for x in v:visit(x)
visit(api)

required=['START_HERE.md','CODEX_START_PROMPT.md']+[f'docs/{i:02d}-{n}.md' for i,n in enumerate(['product-requirements','ui-and-state','system-and-contracts','master-ranking-database','damage-engine','build-plan','acceptance-and-release','open-risks-and-decisions','traceability'])]
for p in required:assert (root/p).is_file(), p
for p in ['reference-ui/ux-design-v0.5.html','references/in-game-rank-audit-template.csv','references/verification-cases.csv']:
 assert (root/p).is_file(), p
with (root/'references/verification-cases.csv').open(encoding='utf-8') as f:
 assert sum(1 for _ in csv.DictReader(f))==47
with (root/'references/in-game-rank-audit-template.csv').open(encoding='utf-8') as f:
 rows=list(csv.DictReader(f)); assert len(rows)==100
 assert set(r['format'] for r in rows)=={'singles','doubles'}
assert 'SavedInputSnapshot' in (root/'contracts/shared-contract.reference.ts').read_text()
assert 'natureId: string;' in (root/'contracts/shared-contract.reference.ts').read_text()
assert 'isMega: boolean' not in (root/'contracts/shared-contract.reference.ts').read_text()
for p in required:
 content=(root/p).read_text(encoding='utf-8')
 assert len(content)>=100
print('PASS: design consistency checks; OpenAPI refs valid; 47 damage + 100 ranking test rows; canonical scope protected.')
