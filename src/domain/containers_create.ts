/** CreateMixin — container creation logic ported from containers_create.py */

import type { APIClient } from "../api/client";
import { prepareBody } from "../api/utils";
import { ImageNotFound } from "../errors";
import type { Container } from "./containers";

export interface ContainerCreateOptions {
  image: string;
  command?: string | string[];
  name?: string;
  env?: Record<string, string> | string[];
  labels?: Record<string, string>;
  capAdd?: string[];
  capDrop?: string[];
  cgroupParent?: string;
  cpuPeriod?: number;
  cpuQuota?: number;
  cpuShares?: number;
  cpusetCpus?: string;
  cpusetMems?: string;
  dns?: string[];
  dnsOpt?: string[];
  dnsSearch?: string[];
  entrypoint?: string | string[];
  groupAdd?: string[];
  healthcheck?: Record<string, unknown>;
  hostname?: string;
  init?: boolean;
  initPath?: string;
  ipcMode?: string;
  labels2?: Record<string, string>;
  mounts?: Record<string, unknown>[];
  networkMode?: string;
  networks?: Record<string, Record<string, unknown>>;
  oomScoreAdj?: number;
  pidMode?: string;
  pidsLimit?: number;
  ports?: Record<string, unknown>;
  privileged?: boolean;
  publishAllPorts?: boolean;
  readOnly?: boolean;
  remove?: boolean;
  autoRemove?: boolean;
  restartPolicy?: { Name: string; MaximumRetryCount?: number };
  runtime?: string;
  secrets?: Array<string | Record<string, unknown>>;
  securityOpt?: string[];
  shmSize?: string | number;
  stdinOpen?: boolean;
  stopSignal?: string;
  sysctls?: Record<string, string>;
  tty?: boolean;
  user?: string | number;
  volumes?: Record<string, { bind: string; mode?: string; extended_mode?: string[] }>;
  volumesFrom?: string[];
  workingDir?: string;
  [key: string]: unknown;
}

/** Convert env list ["KEY=val"] to dict {KEY: val}. */
function envListToDict(envList: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of envList) {
    if (!item.trim()) throw new Error("Environment variable cannot be empty.");
    const idx = item.indexOf("=");
    if (idx === -1) throw new Error(`Environment variable '${item}' must be in KEY=value format.`);
    result[item.slice(0, idx)] = item.slice(idx + 1);
  }
  return result;
}

/** Convert size string like "128m" to bytes. */
function toBytes(size: string | number | undefined): number | undefined {
  if (size === undefined || size === null) return undefined;
  if (typeof size === "number") return size;
  const match = /^(\d+)([bBkKmMgG]?)$/.exec(size);
  if (!match) throw new TypeError(`Invalid size format: '${size}'`);
  const n = Number.parseInt(match[1], 10);
  const unit = (match[2] ?? "b").toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    k: 1024,
    m: 1024 ** 2,
    g: 1024 ** 3,
  };
  return n * (multipliers[unit] ?? 1);
}

/** Map ContainerCreateOptions to the Podman API body. */
export function renderCreatePayload(opts: ContainerCreateOptions): Record<string, unknown> {
  let env: Record<string, string> | undefined;
  if (opts.env) {
    env = Array.isArray(opts.env) ? envListToDict(opts.env) : opts.env;
  }

  // Normalize command
  let command = opts.command;
  if (typeof command === "string") command = [command];

  // Port mappings
  const portmappings: Record<string, unknown>[] = [];
  if (opts.ports) {
    for (const [containerPort, hostPort] of Object.entries(opts.ports)) {
      const [port, proto] = containerPort.split("/");
      portmappings.push({
        container_port: Number.parseInt(port, 10),
        protocol: proto ?? "tcp",
        host_port: hostPort,
      });
    }
  }

  // Volume mounts
  const mounts: Record<string, unknown>[] = opts.mounts ?? [];
  if (opts.volumes) {
    for (const [src, cfg] of Object.entries(opts.volumes)) {
      mounts.push({
        type: "bind",
        source: src,
        destination: cfg.bind,
        options: cfg.extended_mode ?? (cfg.mode ? [cfg.mode] : []),
      });
    }
  }

  return {
    image: opts.image,
    command,
    name: opts.name,
    env,
    labels: opts.labels,
    cap_add: opts.capAdd,
    cap_drop: opts.capDrop,
    cgroup_parent: opts.cgroupParent,
    dns_server: opts.dns,
    dns_option: opts.dnsOpt,
    dns_search: opts.dnsSearch,
    entrypoint: opts.entrypoint,
    groups: opts.groupAdd,
    healthconfig: opts.healthcheck,
    hostname: opts.hostname,
    init: opts.init,
    init_path: opts.initPath,
    ipc_ns: opts.ipcMode ? { nsmode: opts.ipcMode } : undefined,
    mounts,
    networks: opts.networks,
    oci_runtime: opts.runtime,
    oom_score_adj: opts.oomScoreAdj,
    pid_ns: opts.pidMode ? { nsmode: opts.pidMode } : undefined,
    pids_limit: opts.pidsLimit,
    portmappings,
    privileged: opts.privileged,
    publish_image_ports: opts.publishAllPorts,
    read_only_filesystem: opts.readOnly,
    remove: opts.remove ?? opts.autoRemove,
    restart_policy: opts.restartPolicy,
    secrets: opts.secrets,
    security_opt: opts.securityOpt,
    shm_size: toBytes(opts.shmSize),
    stdin: opts.stdinOpen,
    stop_signal: opts.stopSignal,
    sysctl: opts.sysctls,
    terminal: opts.tty,
    user: opts.user !== undefined ? String(opts.user) : undefined,
    volumes_from: opts.volumesFrom,
    work_dir: opts.workingDir,
  };
}

/** Mixin providing create() for ContainersManager. */
export class CreateMixin {
  // Provided by ContainersManager
  protected client!: APIClient;
  protected prepareModel!: (attrs: Record<string, unknown>) => Container;
  protected get!: (key: string) => Promise<Container>;

  async create(opts: ContainerCreateOptions): Promise<Container> {
    const payload = renderCreatePayload(opts);
    const res = await this.client.post<{ Id: string }>("/containers/create", {
      data: prepareBody(payload),
      headers: { "Content-Type": "application/json" },
    });
    res.raiseForStatus(ImageNotFound);
    return this.get(res.data.Id);
  }
}
