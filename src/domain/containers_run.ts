/** RunMixin — container run() logic ported from containers_run.py */

import type { APIClient } from "../api/client";
import { ContainerError, ImageNotFound } from "../errors";
import type { Container } from "./containers";
import type { ContainerCreateOptions } from "./containers_create";

export interface RunOptions extends Omit<ContainerCreateOptions, "image"> {
  stdout?: boolean;
  stderr?: boolean;
  remove?: boolean;
  detach?: boolean;
  stream?: boolean;
  authConfig?: Record<string, string>;
  platform?: string;
  policy?: string;
}

/** Mixin providing run() for ContainersManager. */
export class RunMixin {
  // Provided by ContainersManager
  protected client!: APIClient;
  protected create!: (opts: ContainerCreateOptions) => Promise<Container>;
  protected podmanClient?: {
    images: { pull: (id: string, opts: Record<string, unknown>) => Promise<unknown> };
  };

  async run(
    image: string,
    command?: string | string[],
    options: RunOptions = {},
  ): Promise<Container | string | Uint8Array> {
    const {
      stdout = true,
      stderr = false,
      remove = false,
      detach = false,
      stream = false,
      authConfig,
      platform,
      policy,
      ...createOpts
    } = options;

    let container: Container;
    try {
      container = await this.create({ ...createOpts, image, command });
    } catch (e) {
      if (e instanceof ImageNotFound) {
        await this.podmanClient?.images.pull(image, {
          authConfig,
          platform,
          policy: policy ?? "missing",
        });
        container = await this.create({ ...createOpts, image, command });
      } else {
        throw e;
      }
    }

    await container.start();
    await container.reload();

    if (detach) {
      if (remove) {
        // Fire-and-forget background removal
        container
          .wait()
          .then(() => container.remove())
          .catch(() => {});
      }
      return container;
    }

    const exitCode = await container.wait();

    if (remove) await container.remove();

    if (exitCode !== 0) {
      const _logs = await container.logs({ stdout: false, stderr: true });
      throw new ContainerError(`Container exited with status ${exitCode}`, exitCode);
    }

    const logs = await container.logs({ stdout, stderr });
    return stream ? logs : logs;
  }
}
