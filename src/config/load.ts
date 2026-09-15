import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";
import { z } from "zod";
import type { ResolvedCheck, ResolvedConfig } from "../types.ts";
import {
  configSchema,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_REQUIRED,
  DEFAULT_TIMEOUT_SEC,
  type RawConfig,
} from "./schema.ts";

export const DEFAULT_CONFIG_FILENAME = "aiqh.config.jsonc";

/** Raised for any problem with the config file. The CLI maps it to exit code 2. */
export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

export function loadConfig(configPath: string): ResolvedConfig {
  const absoluteConfigPath = path.resolve(configPath);
  const text = readConfigText(absoluteConfigPath);
  const raw = parseConfigText(text, absoluteConfigPath);
  return resolveConfig(raw, absoluteConfigPath);
}

function readConfigText(absoluteConfigPath: string): string {
  try {
    return readFileSync(absoluteConfigPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new ConfigError(`config file not found: ${absoluteConfigPath}`);
    }
    throw new ConfigError(
      `config file could not be read: ${absoluteConfigPath} (${(err as Error).message})`,
    );
  }
}

/** Parse JSONC text and validate it against the schema. Exported for tests. */
export function parseConfigText(text: string, label = "<config>"): RawConfig {
  const errors: ParseError[] = [];
  const data: unknown = parseJsonc(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`)
      .join("; ");
    throw new ConfigError(`config is not valid JSONC: ${label}: ${details}`);
  }
  if (data === undefined) {
    throw new ConfigError(`config is empty: ${label}`);
  }

  const result = configSchema.safeParse(data);
  if (!result.success) {
    throw new ConfigError(`config is invalid: ${label}\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Apply defaults and resolve paths. Exported for tests. */
export function resolveConfig(raw: RawConfig, absoluteConfigPath: string): ResolvedConfig {
  const projectRoot = path.dirname(absoluteConfigPath);
  const defaultTimeout = raw.defaults?.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  const defaultRequired = raw.defaults?.required ?? DEFAULT_REQUIRED;

  const checks: ResolvedCheck[] = raw.checks.map((check) => {
    const cwd = check.cwd ?? ".";
    const cwdAbsolute = resolveInsideRoot(projectRoot, cwd, `checks "${check.name}" cwd`);
    const resolved: ResolvedCheck = {
      name: check.name,
      kind: check.kind,
      command: check.command,
      cwd,
      cwdAbsolute,
      required: check.required ?? defaultRequired,
      timeoutSec: check.timeoutSec ?? defaultTimeout,
    };
    if (check.description !== undefined) {
      resolved.description = check.description;
    }
    return resolved;
  });

  const outputDir = resolveInsideRoot(
    projectRoot,
    raw.output?.dir ?? DEFAULT_OUTPUT_DIR,
    "output.dir",
  );

  const config: ResolvedConfig = {
    projectRoot,
    configPath: absoluteConfigPath,
    project: { name: raw.project.name },
    outputDir,
    checks,
  };
  if (raw.project.type !== undefined) {
    config.project.type = raw.project.type;
  }
  return config;
}

/**
 * Resolve `relative` against `root` and reject anything that escapes the root.
 * Absolute paths are rejected outright so configs stay portable between machines.
 * Containment is checked lexically and then on real paths, so a symlink inside the root
 * that points outside is rejected as well (R-005). The returned value is the lexical
 * absolute path (what the config author wrote), not the real path.
 */
export function resolveInsideRoot(root: string, relative: string, label: string): string {
  if (path.isAbsolute(relative)) {
    throw new ConfigError(`${label} must be a relative path inside the project root: ${relative}`);
  }
  const absolute = path.resolve(root, relative);
  if (escapes(root, absolute)) {
    throw new ConfigError(`${label} escapes the project root: ${relative}`);
  }
  if (escapes(realpathNearest(root), realpathNearest(absolute))) {
    throw new ConfigError(`${label} escapes the project root via a symlink: ${relative}`);
  }
  return absolute;
}

function escapes(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

/**
 * Real path of `p`. When `p` does not exist yet (e.g. an output directory that verify will
 * create), the nearest existing ancestor is resolved and the remaining segments appended.
 */
export function realpathNearest(p: string): string {
  let existing = p;
  const rest: string[] = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break; // filesystem root
    rest.unshift(path.basename(existing));
    existing = parent;
  }
  let real: string;
  try {
    real = realpathSync(existing);
  } catch {
    real = existing;
  }
  return path.join(real, ...rest);
}
