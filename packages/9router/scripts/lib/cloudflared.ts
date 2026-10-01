import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { assert } from "@pkgs/assert";


let cachedBin: string | null | undefined;

function candidateBins(): string[] {
  const out: string[] = [];
  const add = (p?: string) => {
    if (!p || out.includes(p)) return;
    out.push(p);
  };
  add(process.env.CLOUDFLARED_BIN?.trim());
  // Prefer Homebrew Mach-O before PATH — ~/.local/bin often has a Linux ELF that ENOEXECs on macOS
  add("/opt/homebrew/bin/cloudflared");
  add("/opt/homebrew/opt/cloudflared/bin/cloudflared");
  add("/usr/local/bin/cloudflared");
  const which = spawnSync("which", ["-a", "cloudflared"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (which.status === 0 && which.stdout) {
    for (const line of which.stdout.split(/\r?\n/)) {
      add(line.trim());
    }
  }
  add("cloudflared");
  return out;
}

function probeBin(bin: string): boolean {
  const probe = spawnSync(bin, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (probe.error || probe.status !== 0) return false;
  const text = `${probe.stderr ?? ""}`;
  if (/exec format error|bad CPU type|cannot execute/i.test(text)) return false;
  return true;
}

/** Absolute path (or `cloudflared`) to a runnable binary. */
export function resolveCloudflaredBin(): string {
  if (cachedBin !== undefined) {
    if (cachedBin === null) {
      throw new Error("cloudflared not runnable (cached)");
    }
    assert.nonEmptyString(cachedBin, "cached cloudflared bin must be non-empty");
    return cachedBin;
  }

  const tried: string[] = [];
  for (const bin of candidateBins()) {
    if (bin !== "cloudflared" && !existsSync(bin)) continue;
    tried.push(bin);
    if (probeBin(bin)) {
      if (bin !== "cloudflared" && bin.includes("/")) {
        const pathFirst = spawnSync("which", ["cloudflared"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
          .stdout?.trim();
        if (pathFirst && pathFirst !== bin) {
          console.warn(
            `[cloudflared] Using ${bin} (PATH has broken ${pathFirst}; remove it or put Homebrew first)`,
          );
        }
      }
      cachedBin = bin;
      assert.nonEmptyString(bin, "cloudflared bin must be non-empty");
      return bin;
    }
  }

  cachedBin = null;
  console.error(
    [
      "cloudflared is missing or not runnable on this machine.",
      `Tried: ${tried.join(", ") || "(none)"}`,
      "Install: brew install cloudflared",
      "If brew says PATH is shadowed, remove the broken binary, e.g.:",
      "  rm ~/\\.local/bin/cloudflared",
      "Or set CLOUDFLARED_BIN=/opt/homebrew/bin/cloudflared",
    ].join("\n"),
  );
  process.exit(1);
}

export function ensureCloudflared(): void {
  resolveCloudflaredBin();
}

export function spawnCloudflared(
  args: string[],
  opts?: { stdio?: "inherit" | "pipe"; env?: NodeJS.ProcessEnv },
): ChildProcess {
  assert.array(args, "cloudflared args must be an array");
  const bin = resolveCloudflaredBin();
  assert.nonEmptyString(bin, "cloudflared bin must be non-empty");
  return spawn(bin, args, {
    stdio: opts?.stdio ?? "inherit",
    env: opts?.env ?? process.env,
  });
}
