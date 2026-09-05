# Important Contact

Internal BHOC Contact Intelligence workspace for people, institutions, publications, investors, grants, wildlife/conservation contacts and relationship status.

## Current architecture

- `site/` - current working interface
- `veterinary/` - source-of-truth research and contact data
- `veterinary/data/oxyglobin-authors-institutions.json` - Oxyglobin / hemoglobin glutamer-200 author, institution and publication evidence
- `veterinary/data/snapshot.json` - current structured contact dataset
- `veterinary/research/` - research-agent instructions and evidence-tracking context
- `.github/workflows/pages-preview.yml` - GitHub Pages deployment workflow

Important Contact is a separate project. Do not place it inside BHOC-platform. BHOC-platform may be used only as a scientific source when needed.

## Oxyglobin contact logic

People and institutions are separate records. Preserve the chain:

`Person -> historical publication affiliation -> publication -> species/model -> Oxyglobin/HBOC relationship`

An article affiliation is historical bibliographic evidence. It does not prove current employment, study location or institutional endorsement. Current roles must be verified separately.

## Working counters

The compact workspace uses Authors / Investors / In contact as operational counters. Detailed records remain searchable and filterable below.

## Visibility

If this repository is public for GitHub Pages, only public professional facts, public publication evidence, public institutional information and publicly listed professional contact routes should be exposed. Do not publish private relationship history, Carl Review, private notes, non-public emails, secrets or confidential assessments.
