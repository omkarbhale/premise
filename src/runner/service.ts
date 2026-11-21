import type { RunView } from "../shared/api-types.js";
import { ServiceError, type RunService } from "../server/services.js";
import { type Runner, RunnerError } from "./runner.js";

/** The runner as the page server's run service: refusals become messages the page shows as they are. */
export class RunnerService implements RunService {
  constructor(
    private readonly runner: Runner,
    private readonly known: (softwareId: string) => boolean,
  ) {}

  private require(softwareId: string): void {
    if (!this.known(softwareId))
      throw new ServiceError("NOT_FOUND", "There is no software with that id.");
  }

  async view(softwareId: string): Promise<RunView> {
    this.require(softwareId);
    return this.runner.view(softwareId);
  }

  async start(softwareId: string): Promise<RunView> {
    this.require(softwareId);
    try {
      return await this.runner.start(softwareId);
    } catch (error) {
      if (error instanceof RunnerError) throw new ServiceError("INVALID", error.message);
      throw error;
    }
  }

  async stop(softwareId: string): Promise<RunView> {
    this.require(softwareId);
    return this.runner.stop(softwareId);
  }
}
