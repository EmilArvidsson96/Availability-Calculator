# BESS Availability Calculator

A visual, drag-and-drop web app for estimating the **availability of a battery energy
storage system (BESS)** from its component topology — and, crucially, for working out a
**confidence-bounded number you can actually promise a customer**, not just the optimistic
point estimate.

Lay components on a canvas, draw how they connect **electrically** and over
**communications/control**, enter each component's reliability data, and the app computes the
system availability together with a Monte-Carlo confidence interval (P5 / P50 / P95).

Everything runs in your browser — no data leaves your machine, and the Monte Carlo runs in a
Web Worker so the heavy computation happens locally.

## Why this exists

- Some subsystems carry a **supplier availability warranty** (a contractual figure); others have
  **no guarantee** and must be **estimated from MTBF/MTTR**.
- A warranty is effectively the **lower end of a confidence interval**. To compare the two and
  state what we can promise, the *estimated* parts must also be expressed as a confidence bound.
- **Software** hosted on equipment, **cloud services**, and **external events** (grid/carrier
  outages, force majeure) are usually excluded from hardware MTBF, so they are modelled as
  separate, individually-toggleable layers.

## How the maths works

### Per-component availability
- **Estimated** components: `A = MTBF / (MTBF + MTTR)`. Node-level `k-of-n` redundancy is applied
  for blocks that represent several identical parallel units.
- **Warranted** components: the guaranteed availability `%` is used directly as a fixed lower bound
  (no estimation noise — the risk is contractually transferred to the supplier). `k-of-n` redundancy
  applies here too, on top of the per-unit warranty.
- **SLA** components (cloud/telco): the SLA `%` with an optional *adjustment* derate for the
  exclusions every SLA carries (throttling, maintenance windows, correlated outages).

### BESS block capacity scaling
The **BESS Block (DC+AC)** template (and any other node in the *Aggregated Blocks* group) can model
a whole array of identical warranted blocks as one node: **Units (n)** is how many physical blocks are
built, **Required (k)** is how many must be up to deliver the contracted capacity — the same `k-of-n`
maths used for control equipment (String PCS, HVAC N+1, ...), just applied to a warranted block instead
of an estimated one.

Rather than guessing k, fill in each block's own **power (MW)** / **energy (MWh)** rating and the
site's **contracted power/energy** — the inspector derives the required block count and shows the
nameplate total and spare margin (e.g. 10 blocks built at 5 MW/10 MWh each against a 40 MW/80 MWh
contract needs only 8 of the 10 up, a 25% margin). Building more blocks than the contract requires lets
the site keep showing 100% availability to the trading desk while individual blocks are down for
maintenance or repair.
- An optional **software layer** adds `U_sw = λ·[c·MTTR_auto + (1−c)·MTTR_reboot] + planned-patch`,
  where `c` is the watchdog/auto-recovery coverage.

### System availability from the topology
The drawn graph is a **reliability block diagram**. The system "delivers energy" when an
electrical path exists from a source to the delivery sink through *up* components. This is computed
exactly by **series/parallel reduction**, falling back to **inclusion-exclusion over minimal paths**
for any non-series-parallel topology (e.g. a bridge). The **communication layer** is evaluated the
same way (a control source must reach the delivery point); its availability multiplies the
electrical result. Comms marked *dispatch-only* / *monitoring* feed a separate revenue metric, so a
cloud outage isn't mis-counted as a power outage.

By default, **connections are perfect** — only the components at each end can fail. Click a
connection to give it its own MTBF/MTTR, plus an **"hours without impact" grace window**: if the
link fails, only the repair time beyond that window counts as downtime (the rest is assumed bridged
by local buffering, a backup path, or manual failover). This is how to model something like "if the
grid interconnection drops, we're fine for 2 hours before it affects availability."

### Confidence — what you can promise
"Confidence" here addresses **epistemic** uncertainty (we don't know the *true* MTBF/MTTR), not the
random scatter of individual failures. A **parametric-bootstrap Monte Carlo** samples each estimated
component's failure rate from a Gamma posterior (`λ ~ Gamma(effective-failures, …)`, equivalent to
the chi-square MTBF interval) and its repair time from a lognormal, runs each draw through the
compiled topology, and reports the distribution's **P50 (expected)** and a **lower percentile (the
promise)** at the chosen confidence (e.g. P5 at 95%). Warranted/SLA components enter as fixed values.

> The single-component sampler is unit-tested to reproduce the analytic chi-square lower bound, which
> guards against the classic mistake of simulating failure *events* (a finite-horizon prediction
> interval) instead of sampling the uncertain *parameters* (a confidence bound on the true long-run
> availability).

### Raw vs contractual
- **Raw** availability counts every modelled downtime, including all external events.
- **Contractual** availability drops external events flagged as excluded (force majeure, grid
  curtailment, planned maintenance), matching how O&M contracts "stop the clock".

Both are always shown so the carve-outs are explicit.

### ⚠️ Assumptions & disclaimer
The model assumes exponential time-to-failure, lognormal repair time, and **independent** components
(no common-cause correlation). All palette defaults are **illustrative** — replace every value from
the OEM datasheet, the signed LTSA/TAG, and the site single-line diagram. The P-lower figure is a
modelled confidence bound **for guidance, not a contractual guarantee**.

## Using the app

1. **Drag** components from the left palette onto the canvas.
2. **Connect** them. Pick the layer with the *Draw connections as* toggle: **⚡ Electrical** (solid
   orange) or **📡 Comms** (dashed purple). Use the *View layer* toggle to focus on one layer.
3. Select a component to edit its **MTBF/MTTR or warranty %**, redundancy, software layer, and
   **network role** (electrical source, delivery sink, control source). Select a connection instead
   to give it its own failure model and an **"hours without impact" grace window**.
4. Add **external events** in the External tab.
5. Click **Run Monte Carlo** to get the P5/P50/P95 distribution, the downtime-contribution waterfall,
   and the highlighted weakest links.
6. **Export/Import** your model as JSON (it also autosaves to your browser).

## Development

```bash
npm install
npm run dev      # local dev server
npm run test     # engine unit tests (Vitest)
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

## Deployment (GitHub Pages)

The app is a static SPA. A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and
deploys to GitHub Pages on every push to `main`.

To enable it once: **repository → Settings → Pages → Build and deployment → Source = "GitHub
Actions"**. The site is then served at `https://<owner>.github.io/Availability-Calculator/`
(the Vite `base` is set accordingly in `vite.config.ts`).

## Keeping company data private

Everything checked into *this* repo — the component palette, the example site — is illustrative
only. Real project data (actual site configurations, MTBF/MTTR figures, warranted availabilities,
project names) shouldn't be committed here at all. Instead:

1. Create a separate **private** GitHub repo to hold it (e.g. `availability-calculator-data`), with
   a `projects/` folder for exported model JSON files.
2. In the app, open **Private data** in the toolbar, fill in that repo's owner/name/branch, and
   paste in a GitHub [personal access token](https://github.com/settings/tokens) — ideally a
   fine-grained token scoped to just that one repo with **Contents: Read and write** — nothing
   else.
3. Use **Save to repo** / **Load** in that panel to push and pull project files.

The token and repo settings are saved only in your browser's `localStorage` and are sent only to
`api.github.com` (which supports token-authenticated requests directly from a browser, the same
way tools like github.dev do) — they're never bundled into the deployed app or committed anywhere.
Rotate or revoke the token from GitHub any time.

## Login gate

The app can sit behind a simple username/password screen (`src/auth/`). **Read this before relying
on it**: this app is a static site with no backend, so the "gate" is a check that runs in the
visitor's own browser. It stops someone from casually opening the link, but anyone who opens dev
tools can read the code and work around it — it is not a real access-control boundary. Don't use it
as the only thing standing between the public internet and information that actually needs to stay
confidential; for that, keep the data out of the deployed build entirely (see above) and/or don't
publish the site as a public GitHub Pages URL in the first place.

To enable it:

1. Generate a password hash: `npm run hash-password -- "your-password"`.
2. **Locally**: copy `.env.local.example` to `.env.local` and fill in `VITE_AUTH_USERNAME` and
   `VITE_AUTH_PASSWORD_HASH` (the hash from step 1). `.env.local` is gitignored.
3. **Deployed build**: in the repo's **Settings → Secrets and variables → Actions**, add repo
   secrets `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` (same two values). The deploy workflow passes
   them into the build as `VITE_AUTH_USERNAME` / `VITE_AUTH_PASSWORD_HASH`.

Leaving `VITE_AUTH_PASSWORD_HASH` unset disables the gate entirely (the default, so local dev
without a `.env.local` behaves exactly as before). A logged-in session is remembered in
`localStorage` until **Log out** is clicked or the password is rotated.

## Tech stack

Vite · React · TypeScript · [@xyflow/react](https://reactflow.dev) (canvas) · Zustand (state) ·
Recharts (charts). The availability engine (`src/engine/`) is dependency-free, pure TypeScript and
fully unit-tested.

## Project structure

```
src/
  engine/        availability maths — distributions, network reduction, Monte Carlo (+ tests)
  data/          component palette/taxonomy and the example site
  store/         Zustand store (graph, results, persistence, worker orchestration)
  canvas/        React Flow canvas, custom node, palette
  panels/        toolbar, inspector, results, external-events, private-data sync panel
  auth/          login gate (see "Login gate" above)
  lib/           edge styling, formatting helpers, GitHub sync client
  types/         domain model
```
