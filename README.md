# SQL Interview Gym

Browser-only practice for a live analyst SQL round, aimed at a Wise Analytics Graduate / Graduate Analyst process. There is no backend. Queries run in SQLite, compiled to WebAssembly, and your progress stays in `localStorage`.

The expected site is [https://jimmmmmmmmmmmy.github.io/sql-interview-gym/](https://jimmmmmmmmmmmy.github.io/sql-interview-gym/).

This is not an official Wise interview, and it is not affiliated with Wise. The questions are original. They are written in the spirit of public candidate reports, not copied from any exam.

## What James needs to do for GitHub Pages

The workflow deploys with `actions/deploy-pages` on every push to `main`. This environment cannot change repository settings (GitHub access here is read-only), so Pages will not update until the source is switched once:

1. Open the repo **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions** (not "Deploy from a branch").
3. Merge this branch to `main`. If the Actions run waits on a `github-pages` environment approval, approve it once.

Until that source is GitHub Actions, the workflow can go green and still not publish the site.

## Why sql.js

The engine is [sql.js](https://github.com/sql-js/sql.js) (SQLite compiled to WebAssembly).

- It runs in a normal browser page. GitHub Pages cannot set the cross-origin isolation headers the threaded DuckDB-WASM build expects, and sql.js does not need them.
- The same package grades the reference answers in Node and in the browser, so a solution that passes the tests is the solution the site grades.
- SQLite already has the SQL this round actually uses: joins, `GROUP BY` / `HAVING`, `CASE`, CTEs, and window functions (`ROW_NUMBER`, `RANK`, `LAG`, running `SUM`).

DuckDB-WASM is closer to Snowflake syntax (`DATE_TRUNC`, `QUALIFY`). It is also a much larger download. Public reports describe Wise's analyst SQL as easy-to-moderate under time pressure, which SQLite covers. The schema panel lists the SQLite spellings (`strftime`, `julianday`) and the warehouse features that are missing.

## Run it locally

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:5173/sql-interview-gym/](http://localhost:5173/sql-interview-gym/). The dev server uses the same base path as GitHub Pages.

`npm run build` writes `dist/`. `npm run preview` serves that build.

## How to use it

**Practice.** Pick any of the 30 questions. The schema is on the right (or below, on a phone). The editor is CodeMirror. Ctrl/Cmd+Enter runs the query. Ctrl/Cmd+Shift+Enter submits it for grading. Hints, a reference solution, and interviewer-style follow-ups are on the question. A question stays solved once a submission matches.

**Mock interview.** 40 minutes, five questions, one from each tier, easiest first. The set is random and then fixed for that attempt, including across refresh. The clock does not pause. After you submit, follow-up prompts appear. They are not graded. Skip scores as incorrect. The summary is the number you got right and the time you used.

**Grading.** Your result is compared to the reference query on a fresh copy of the seed. Column names can differ. Row order is ignored unless the prompt says the order is graded. Numbers can be off by about 0.02, or by a tiny relative amount on large values. `NULL` is not the same as `0`.

Each run uses a new copy of the database, so `UPDATE` and `DELETE` do not stick. If you send several statements, only the last result is graded.

## Dataset

The seed is deterministic (`20241114`). Approximate size:

| Table | Rows |
| --- | ---: |
| users | 640 |
| accounts | 933 |
| transfers | 2,543 |
| card_transactions | 1,403 |
| funnel_events | 2,213 |
| fx_rates | ~85,000 daily mid rates for the pairs those transfers use |

Money is integer cents, including yen, so sums stay exact. Timestamps are UTC text (`YYYY-MM-DD HH:MM:SS`). The world is a cross-border transfer product: profile country, multi-currency accounts, transfer status (including refunded), fees, an FX rate, payout method, card charges, and a signup / KYC event log. Some fees are missing, some KYC events are duplicated or out of order, and a few completed transfers belong to customers who are not approved. That is intentional.

## Tests

`npm test` loads the same seed and checks that:

- the seed is deterministic and contains the edge cases the questions rely on
- every reference solution runs and grades itself as correct
- column aliases and row order are tolerated when the question allows it
- a wrong result is marked wrong
- an interview draw is five questions, one per tier, stable for a seed

## Question themes and sources

Public write-ups do not publish Wise's live SQL verbatim. They do repeat a shape: standard SQL under a clock, joins and aggregations, window functions, a query someone has to debug, and product metrics such as retention. These questions are original drills in that shape (corridors, fees, KYC funnel, refunds, card duplicates), plus a follow-up after each one so you practice saying how the metric would change.

Sources used for themes, not for wording:

- [Glassdoor — Wise Data Analyst interviews](https://www.glassdoor.co.uk/Interview/Wise-Data-Analyst-Interview-Questions-EI_IE637715.0,4_KO5,17.htm). Candidates describe standard SQL that is not extremely hard, a SQL query they had to diagnose, and adjacent questions on dbt and Airflow.
- [Glassdoor — Wise Data Analyst Intern interviews](https://www.glassdoor.co.uk/Interview/Wise-Data-Analyst-Intern-Interview-Questions-EI_IE637715.0,4_KO5,24.htm). A HackerRank SQL test, and a round that mixed maths with SQL / databases.
- [Reddit r/cscareerquestionsEU — Wise new grad](https://www.reddit.com/r/cscareerquestionsEU/comments/ztx6i6/has_anyone_here_worked_at_wise/). The coding test included a basic SQL question; a later round was described as database querying rather than LeetCode.
- [Reddit r/cscareerquestionsEU — Wise Maki assessment](https://www.reddit.com/r/cscareerquestionsEU/comments/1iyscf0/wise_maki_virtual_assessements/). Grad product analyst candidates reported a SQL section easier than LeetCode easy, plus numerical reasoning and data visualization, with the clock mattering.
- [Reddit r/cscareerquestionsuk — Wise analytics internship](https://www.reddit.com/r/cscareerquestionsuk/comments/1hrg52h/wise_analytics_summer_internship/). Candidates described a timed SQL section and running out of time.
- [Reddit r/interviews — Wise analytics engineer, UK](https://www.reddit.com/r/interviews/comments/1lelz48/analytics_engineer_at_wise_uk/). A live round of about four SQL tasks (joins, window functions) plus a SQL debugging / optimization review, done without being able to execute the code, and a later performance case about cost and speed.
- [Interview Query — TransferWise / Wise data engineer guide](https://www.interviewquery.com/prep-guides/transferwise-data-engineer). Describes a HackerRank SQL task built around joins and aggregations. Different role, same public theme.
- [Dataford — Wise Data Analyst guide](https://dataford.io/interview-guides/wise/data-analyst). Secondary summary of public reports: debug a query, write SQL, retention and time-series style analysis.
- [Get Smart Resume — Wise graduate program](https://www.getsmartresume.com/article/wise-graduate-program). Secondary write-up that, from Glassdoor and public candidate reports, describes live SQL for analytics graduates, window functions, and retention or churn metrics on transaction-style data.

Wise's product context (cross-border transfers, fees, FX, KYC, cards) comes from Wise's own public description of the business, not from an interview bank.
