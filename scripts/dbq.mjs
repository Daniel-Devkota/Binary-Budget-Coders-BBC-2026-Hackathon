/**
 * Ad-hoc SQL against the linked project, through the Supabase CLI's own
 * connection (`supabase db query -f`). Test scaffolding: it is how the
 * confirmation tests set up states no client API can reach — a held booking
 * whose auto_confirm_at is already in the past, for one.
 *
 * SQL goes through a temp file rather than argv so quoting never bites.
 * Nothing in src/ imports this.
 */
import { execSync } from 'node:child_process'
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** Runs SQL and returns the rows of the last statement. Throws on error. */
export function q(text) {
  const file = join(mkdtempSync(join(tmpdir(), 'dbq-')), 'q.sql')
  writeFileSync(file, text, 'utf8')
  try {
    const out = execSync(
      `npx supabase db query --linked --output-format json -f "${file}"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 24 },
    )
    const i = out.indexOf('{')
    if (i < 0) return []
    return JSON.parse(out.slice(i)).rows ?? []
  } catch (e) {
    // The CLI reports SQL errors on stdout as JSON and exits non-zero; without
    // this the only thing you see is "Command failed".
    const m = /Failed to run sql query: ([^"]+)/.exec(e.stdout ?? '')
    throw new Error(m ? m[1].replace(/\+n/g, ' ').trim() : (e.stdout || e.message))
  } finally {
    try { unlinkSync(file) } catch { /* temp dir, does not matter */ }
  }
}

/** First row, or undefined. */
export const q1 = (text) => q(text)[0]
