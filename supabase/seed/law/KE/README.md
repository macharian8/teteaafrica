# Kenya Law Corpus — Seed Documents

Place the following 9 plain-text files in this directory, then run:

```bash
pnpm run seed:law
```

---

## Documents to Obtain

All documents are publicly available from [kenyalaw.org](https://kenyalaw.org) and the
National Council for Law Reporting.

| Filename | Source document | URL |
|---|---|---|
| `constitution_2010.txt` | Constitution of Kenya 2010 | https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/ConstituationofKenya2010.pdf |
| `access_to_information_act_2016.txt` | Access to Information Act, 2016 (No. 31 of 2016) | https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/AccesstoInformationAct_No31of2016.pdf |
| `county_governments_act_2012.txt` | County Governments Act, 2012 (No. 17 of 2012) | https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/CountyGovernmentsAct_No17of2012.pdf |
| `public_finance_management_act_2012.txt` | Public Finance Management Act, 2012 | https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/PublicFinanceManagementAct_2012.pdf |
| `emca.txt` | Environmental Management and Co-ordination Act (EMCA), Cap 387 | https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/EnvironmentalManagementandCo-ordinationAct_Cap387.pdf |
| `ppra_act_2015.txt` | Public Procurement and Asset Disposal Act, 2015 (No. 33 of 2015) | https://kenyalaw.org/kl/fileadmin/pdfdownloads/Acts/PublicProcurementandAssetDisposalAct_No33of2015.pdf |
| `national_assembly_standing_orders.txt` | National Assembly Standing Orders (2022 edition) | https://www.parliament.go.ke/sites/default/files/2022-10/NASO%202022.pdf |
| `senate_standing_orders.txt` | Senate Standing Orders (2021 edition) | https://www.parliament.go.ke/sites/default/files/2021-10/Senate%20Standing%20Orders%202021.pdf |
| `county_assembly_model_standing_orders.txt` | Model County Assembly Standing Orders | https://kenyalaw.org/kl/index.php?id=5958 |

---

## Priority Articles for Civic Action

These constitutional articles are the most frequently cited in civic actions.
When seeding, verify they are captured in the chunks:

- **Article 10** — National Values and Principles (public participation as a value)
- **Article 35** — Right of Access to Information
- **Article 37** — Right to Petition Parliament
- **Article 118** — Public Access to Parliament
- **Article 119** — Right to Petition Parliament (public)
- **Article 174** — Devolution and county participation
- **Article 196** — County Assembly public participation

---

## Obtaining Plain Text

1. Download the PDF from the URL above
2. Extract text with `pdftotext` (poppler-utils) for clean text PDFs:
   ```bash
   pdftotext input.pdf output.txt
   ```
3. For scanned PDFs use OCR:
   ```bash
   ocrmypdf input.pdf temp.pdf && pdftotext temp.pdf output.txt
   ```
4. Review the output — remove cover pages, table of contents page numbers,
   and any repeated headers/footers that would pollute chunks
5. Save as UTF-8 `.txt` in this directory

---

## Notes

- The seeder chunks at ~500 tokens (≈ 2000 chars) with 50-token (≈ 200 char) overlap
- Embeddings use OpenAI `text-embedding-3-small` (1536 dimensions)
- Re-running the seeder is idempotent — it skips chunks already in the DB
  (matched by statute_name + chunk_index)
- The `match_law_chunks` Postgres function (migration 000012) handles
  vector similarity search, always filtered by `country_code = 'KE'`
