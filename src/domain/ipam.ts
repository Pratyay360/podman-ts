/** Classes to support Internet Protocol Address Management. Provided for compatibility. */

export interface IPAMPoolOptions {
  subnet?: string;
  iprange?: string;
  gateway?: string;
  auxAddresses?: Record<string, string>;
}

/** Collect IP Network configuration. */
export class IPAMPool {
  Subnet?: string;
  IPRange?: string;
  Gateway?: string;
  AuxiliaryAddresses?: Record<string, string>;

  constructor(options: IPAMPoolOptions = {}) {
    this.Subnet = options.subnet;
    this.IPRange = options.iprange;
    this.Gateway = options.gateway;
    this.AuxiliaryAddresses = options.auxAddresses;
  }
}

export interface IPAMConfigOptions {
  driver?: string;
  poolConfigs?: IPAMPool[];
  options?: Record<string, unknown>;
}

/** Collect IP Address configuration. */
export class IPAMConfig {
  Driver: string;
  Config: IPAMPool[];
  Options: Record<string, unknown>;

  constructor(options: IPAMConfigOptions = {}) {
    this.Driver = options.driver ?? "host-local";
    this.Config = options.poolConfigs ?? [];
    this.Options = options.options ?? {};
  }
}
