/** Registry metadata about an Image. */

import type { APIClient } from "../api/client.ts";
import { parseRepository } from "../api/utils.ts";
import { InvalidArgument } from "../errors.ts";
import type { Image } from "./images.ts";
import { type Manager, PodmanResource } from "./manager.ts";

export class RegistryData extends PodmanResource {
  readonly imageName: string;

  constructor(
    imageName: string,
    attrs: Record<string, unknown>,
    client: APIClient,
    manager: Manager<PodmanResource>,
  ) {
    super(attrs, client, manager);
    this.imageName = imageName;
  }

  async pull(platform?: string): Promise<Image> {
    const [repository] = parseRepository(this.imageName);
    // manager here is ImagesManager — cast for access
    const imagesManager = this.manager as unknown as {
      pull: (repo: string, opts: Record<string, unknown>) => Promise<Image>;
    };
    return imagesManager.pull(repository, { tag: this.id, platform });
  }

  hasPlatform(platform: string | Record<string, string>): boolean {
    let os: string;
    let architecture: string;

    if (typeof platform === "string") {
      const parts = platform.split("/");
      os = parts[0] ?? "";
      architecture = parts[1] ?? "";
    } else {
      os = platform["os"] ?? "";
      architecture = platform["architecture"] ?? "";
    }

    if (!os || !architecture) {
      throw new InvalidArgument(
        `'${JSON.stringify(platform)}' is not a valid platform descriptor.`,
      );
    }

    return (
      os === (this.attrs["Os"] as string) && architecture === (this.attrs["Architecture"] as string)
    );
  }
}
