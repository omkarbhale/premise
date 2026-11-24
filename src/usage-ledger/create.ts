import type { PremiseConfig } from "../config/settings.js";
import { type DemoMode, DemoUsageLedger } from "./demo-usage-ledger.js";
import { type LedgerRun, ledgerCommand } from "./ledger-command.js";
import { type LedgerStore, RealUsageLedger } from "./real-usage-ledger.js";
import type { UsageLedger } from "./usage-ledger.js";

type LedgerConfig = Pick<PremiseConfig, "usage_ledger"> & {
  agents: Pick<PremiseConfig["agents"], "mode" | "claude_config_folder">;
};

/**
 * Which figures premise uses (decision 0330): the usage-ledger command for real agents, made-up
 * demo figures for scripted ones, which use nothing. "real" always uses the command.
 */
export function ledgerMode(config: LedgerConfig): "real" | DemoMode {
  const mode = config.usage_ledger.mode;
  if (mode === "real") return "real";
  if (config.agents.mode === "claude") return "real";
  if (mode === "demo-random" || mode === "mock-random") return "demo-random";
  return "demo-fixed";
}

/** The usage-ledger command as configured. */
export function configuredLedgerCommand(config: LedgerConfig, env?: NodeJS.ProcessEnv): LedgerRun {
  return ledgerCommand({
    command: config.usage_ledger.command,
    database: config.usage_ledger.database,
    logs: config.agents.claude_config_folder,
    timeoutMs: config.usage_ledger.timeout_seconds * 1000,
    ...(env && { env }),
  });
}

export function createUsageLedger(
  config: LedgerConfig,
  options: { store: LedgerStore; run?: LedgerRun; env?: NodeJS.ProcessEnv },
): UsageLedger {
  const mode = ledgerMode(config);
  if (mode === "real") {
    return new RealUsageLedger({
      run: options.run ?? configuredLedgerCommand(config, options.env),
      store: options.store,
      command: config.usage_ledger.command,
      readAfterMs: config.usage_ledger.read_after_seconds * 1000,
      recheckMs: config.usage_ledger.recheck_minutes * 60_000,
      catchUpDays: config.usage_ledger.catch_up_days,
    });
  }
  const seed = config.usage_ledger.seed ?? Math.floor(Math.random() * 2 ** 31);
  return new DemoUsageLedger(mode, seed, {
    weeklyAllowanceUsd: config.usage_ledger.demo_weekly_allowance_usd,
    costScale: config.usage_ledger.demo_cost_scale,
  });
}
