// Leest CI-gegevens van GitHub: met de GitHub-API als er een token is (in GitHub Actions), anders met `gh`.
// Alleen lezen. Geen van beide beschikbaar: alles wat hiervan afhangt wordt "niet te meten".
const ANSI = /(?:\x1b|\^\[)\[[0-9;]*m/g;

export function maakGithub({ repo, token, sh }) {
  const heeftGh = !!repo && !token && sh('gh', ['--version']) != null;
  async function api(pad, { tekst = false } = {}) {
    if (token) {
      try {
        const r = await fetch(`https://api.github.com/${pad}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'brbnt-scan' },
          redirect: 'follow',
        });
        if (!r.ok) return null;
        return tekst ? await r.text() : await r.json();
      } catch { return null; }
    }
    if (heeftGh) {
      const out = sh('gh', ['api', pad]);
      if (out == null) return null;
      if (tekst) return out;
      try { return JSON.parse(out); } catch { return null; }
    }
    return null;
  }
  return { beschikbaar: !!(repo && (token || heeftGh)), bron: token ? 'GitHub-API' : heeftGh ? 'gh' : null, api };
}

const sec = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 1000) : null);

/** Runs, de laatste afgeronde run op de hoofdtak (met stappen en testaantallen uit de log), variabelen en PR's. */
export async function haalCi(gh, { repo, hoofdtak, eigenWorkflow = 'brbnt-scan' }) {
  if (!gh.beschikbaar) return { beschikbaar: false, reden: repo ? 'geen GitHub-toegang (geen token en geen gh)' : 'geen GitHub-remote' };
  const lijst = await gh.api(`repos/${repo}/actions/runs?per_page=60`);
  if (!lijst?.workflow_runs) return { beschikbaar: false, reden: 'CI-runs niet op te halen' };
  const runs = lijst.workflow_runs.filter((r) => r.name !== eigenWorkflow).map((r) => ({
    databaseId: r.id, number: r.run_number, displayTitle: r.display_title, conclusion: r.conclusion, status: r.status,
    createdAt: r.created_at, startedAt: r.run_started_at, updatedAt: r.updated_at, headBranch: r.head_branch, event: r.event,
    workflowName: r.name, headSha: r.head_sha, url: r.html_url, duurSec: sec(r.run_started_at, r.updated_at),
  }));
  const main = runs.find((r) => r.headBranch === hoofdtak && r.status === 'completed');
  let laatsteRun = null;
  if (main) {
    const jobsJson = await gh.api(`repos/${repo}/actions/runs/${main.databaseId}/jobs`);
    const jobs = (jobsJson?.jobs || []).map((j) => ({
      id: j.id, naam: j.name, conclusie: j.conclusion, duurSec: sec(j.started_at, j.completed_at),
      stappen: (j.steps || []).map((s) => ({ naam: s.name, conclusie: s.conclusion, duurSec: sec(s.started_at, s.completed_at) })),
    }));
    let log = '';
    for (const j of jobs) log += ((await gh.api(`repos/${repo}/actions/jobs/${j.id}/logs`, { tekst: true })) || '') + '\n';
    laatsteRun = { run: main, jobs, ...leesTestlog(log.replace(ANSI, '')) };
  }
  const vars = await gh.api(`repos/${repo}/actions/variables`);
  const pulls = await gh.api(`repos/${repo}/pulls?state=all&per_page=100`);
  const prs = (pulls || []).map((p) => ({ number: p.number, title: p.title, state: p.merged_at ? 'MERGED' : p.state === 'open' ? 'OPEN' : 'CLOSED', headRefName: p.head?.ref, mergedAt: p.merged_at, url: p.html_url }));
  return {
    beschikbaar: true, bron: gh.bron, opgehaald: new Date().toISOString(), repo, runs, laatsteRun,
    variabelen: (vars?.variables || []).map((v) => ({ name: v.name, value: v.value, updatedAt: v.updated_at })), prs,
  };
}

/** Testaantallen uit een CI-log. Vitest (met of zonder projectlabel) en Jest; anders blijft het leeg. */
export function leesTestlog(log) {
  const perBestand = [];
  for (const m of log.matchAll(/([✓↓×❯])\s+(?:([a-z][\w-]*)\s+)?(\S+\.(?:test|spec)\.[cm]?[jt]sx?)\s+\((\d+) tests?(?:\s*\|\s*(\d+) (skipped|failed))?\)/g)) {
    perBestand.push({ laag: m[2] || null, bestand: m[3], tests: +m[4], overgeslagen: m[6] === 'skipped' ? +m[5] : 0, gefaald: m[6] === 'failed' ? +m[5] : 0 });
  }
  for (const m of log.matchAll(/\b(PASS|FAIL)\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)/g)) {
    if (!perBestand.some((b) => b.bestand === m[2])) perBestand.push({ laag: null, bestand: m[2], tests: null, overgeslagen: 0, gefaald: m[1] === 'FAIL' ? 1 : 0 });
  }
  const vt = /Tests\s+(\d+) passed(?:\s*\|\s*(\d+) skipped)?(?:\s*\|\s*(\d+) failed)?\s*\((\d+)\)/.exec(log);
  const jt = /Tests:\s+(?:(\d+) failed, )?(?:(\d+) skipped, )?(\d+) passed, (\d+) total/.exec(log);
  const totaal = vt ? { geslaagd: +vt[1], overgeslagen: +(vt[2] || 0), gefaald: +(vt[3] || 0), totaal: +vt[4] }
    : jt ? { geslaagd: +jt[3], overgeslagen: +(jt[2] || 0), gefaald: +(jt[1] || 0), totaal: +jt[4] } : null;
  const files = /Test Files\s+(\d+) passed(?:\s*\|\s*(\d+) skipped)?\s*\((\d+)\)/.exec(log);
  const duur = /Duration\s+([\d.]+)s/.exec(log);
  return { perBestand, totaal, bestanden: files ? { geslaagd: +files[1], overgeslagen: +(files[2] || 0), totaal: +files[3] } : null, testduurSec: duur ? +duur[1] : null };
}
