/**
 * Inputs for the regex equivalence test of M2-0-R3-001 (追加1 / 追加2): matching values and near
 * misses for the four categories whose regexes were rewritten as anchor + rest. Deterministic
 * (fixed seed); secret-shaped strings exist only at run time (assembled from pieces).
 */
import { KEY_VALUE_KEYS } from "../src/security/patterns.ts";

export interface EquivalenceInputs {
  "private-key": string[];
  "url-credential": string[];
  github: string[];
  "key-value": string[];
}

export function equivalenceInputs(seed = 20260923): EquivalenceInputs {
  let s = seed;
  const rnd = (n: number): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return Math.floor((s / 4294967296) * n);
  };
  const pick = <T>(xs: readonly T[]): T => xs[rnd(xs.length)]!;
  const run = (chars: string, n: number): string => Array.from({ length: n }, () => chars[rnd(chars.length)]!).join("");
  const ALNUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const CONTEXT_BEFORE = ["", "x", "_", "-", " ", "1", ".", "=", '"'];
  const CONTEXT_AFTER = ["", "_", "a", "_x", "-", " ", ".", "9", '"', ",", "\n"];

  // github (追加2: gh?_ and github_pat_ adjacent / overlapping, word characters before and after)
  const GH_PREFIXES = ["ghp_", "gho_", "ghu_", "ghs_", "ght_", "ghr_", "ghx_", "gh_", "ghp", "github_pat_", "github_pat__", "github_pa_", "xghp_", "_ghp_", "ghp_github_pat_", "github_pat_ghp_", "ghr_ghp_", "ghp_ghp_", "gghp_", "Ghp_"];
  const github: string[] = [];
  for (const prefix of GH_PREFIXES) {
    for (const n of [0, 1, 19, 20, 21, 40, 300]) {
      for (const tailChars of [ALNUM, `${ALNUM}_`, `${ALNUM}_-`]) {
        const before = pick(CONTEXT_BEFORE);
        const after = pick(CONTEXT_AFTER);
        github.push(`${before}${prefix}${run(tailChars, n)}${after}`);
      }
    }
  }
  // a classic token directly followed by a fine-grained one and the reverse, with and without a separator
  for (const sep of ["", " ", "_", ","]) {
    github.push(`ghp_${run(ALNUM, 24)}${sep}github_pat_${run(`${ALNUM}_`, 30)}`);
    github.push(`github_pat_${run(`${ALNUM}_`, 30)}${sep}ghp_${run(ALNUM, 24)}`);
  }

  // key-value: every key spelling, prefixes, quotes, separators, spacing and value forms
  const keys = KEY_VALUE_KEYS.split("|").flatMap((k) => ["", "_", "-"].map((sep) => k.replace(/\[_-\]\?/g, sep)));
  const KEY_PREFIX = ["", "AWS_", "my", "x-", "1", "MY_", "_", "."];
  const KEY_CASE = [(k: string) => k, (k: string) => k.toUpperCase(), (k: string) => k[0]!.toUpperCase() + k.slice(1)];
  const VALUES = [
    () => `"${run(ALNUM, 8 + rnd(20))}"`,
    () => `"a b\\"c ${run(ALNUM, 6)}"`,
    () => `'${run(ALNUM, 8 + rnd(20))}'`,
    () => `'it\\'s ${run(ALNUM, 6)}'`,
    () => `"${run(ALNUM, 10)} unterminated`,
    () => `'${run(ALNUM, 10)} unterminated`,
    () => run(`${ALNUM}_-.`, 1 + rnd(20)),
    () => "",
    () => '""',
    () => "[REDACTED:anthropic]",
    () => "${ENV_VAR}",
  ];
  const keyValue: string[] = [];
  for (let i = 0; i < 3000; i += 1) {
    const key = pick(KEY_CASE)(pick(keys));
    const q = pick(["", '"', "'"]);
    const sep = pick([":", "=", " ", ":=", "=>"]);
    keyValue.push(`${pick(CONTEXT_BEFORE)}${pick(KEY_PREFIX)}${key}${q}${" ".repeat(rnd(3))}${sep}${" ".repeat(rnd(3))}${pick(VALUES)()}${pick([...CONTEXT_AFTER, " tail", ';x', '"more'])}`);
  }

  // private-key: empty / long / odd labels, missing END, two BEGINs, other PEM kinds, multi-line bodies
  const D = "-".repeat(5);
  const LABELS = ["", "RSA ", "EC ", "OPENSSH ", "ENCRYPTED ", "A".repeat(33), "A".repeat(260), "A B C ", "rsa ", "RSA", "R-SA ", "1 2 "];
  const privateKey: string[] = [];
  for (const label of LABELS) {
    for (const endLabel of ["", "RSA ", label, "X".repeat(40)]) {
      for (const body of ["", "MIIE", `\n${run(ALNUM, 64)}\n${run(ALNUM, 20)}\n`, `${D}END `, `${D}BEGIN RSA `]) {
        const begin = `${D}BEGIN ${label}PRIVATE KEY${D}`;
        const end = `${D}END ${endLabel}PRIVATE KEY${D}`;
        privateKey.push(`${pick(CONTEXT_BEFORE)}${begin}${body}${end}${pick(CONTEXT_AFTER)}`);
        privateKey.push(`${begin}${body}`); // no END
        privateKey.push(`${begin}${body}${begin}${body}${end}`); // two BEGINs
      }
    }
  }
  for (const kind of ["PUBLIC KEY", "CERTIFICATE", "PRIVATE KEY", "PRIVATE  KEY", "PRIVATE KEY-", "private key"]) {
    privateKey.push(`${D}BEGIN ${kind}${D}\nabc\n${D}END ${kind}${D}`);
  }

  // url-credential: scheme lengths around the scanner bound, credentials present / absent / odd
  const url: string[] = [];
  const SCHEME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789+.-";
  for (const n of [1, 2, 5, 63, 64, 65, 66, 200]) {
    for (const cred of [
      () => `${run(ALNUM, 5)}:${run(ALNUM, 8)}@`,
      () => `:${run(ALNUM, 8)}@`,
      () => `${run(ALNUM, 5)}:@`,
      () => `${run(ALNUM, 5)}@`,
      () => `a/b:${run(ALNUM, 4)}@`,
      () => `${run(ALNUM, 5)}:p/q@`,
      () => `${run(ALNUM, 5)}:p:q@`,
      () => "",
    ]) {
      for (const schemeKind of ["letters", "mixed"] as const) {
        const scheme = schemeKind === "letters" ? `s${"x".repeat(n - 1)}` : `h${run(SCHEME_CHARS, n - 1)}`;
        url.push(`${pick(CONTEXT_BEFORE)}${scheme}://${cred()}host.example/p${pick(CONTEXT_AFTER)}`);
      }
    }
  }
  return { "private-key": privateKey, "url-credential": url, github, "key-value": keyValue };
}
