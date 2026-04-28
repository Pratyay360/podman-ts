/**
 * KubeManager — Kubernetes YAML generation, apply, and play operations.
 *
 * Covers:
 *   GET  /libpod/generate/kube          — GenerateKubeLibpod
 *   GET  /libpod/generate/{name}/systemd — GenerateSystemdLibpod
 *   POST /libpod/kube/apply             — KubeApplyLibpod
 *   POST /libpod/play/kube              — PlayKubeLibpod
 *   DELETE /libpod/play/kube            — PlayKubeDownLibpod
 */

import type { APIClient } from "../api/client";

export interface GenerateKubeOptions {
  /** Include pod(s) in the generated YAML. */
  pods?: boolean;
  /** Replica count for Deployment resources. */
  replicas?: number;
  /** Produce a Kubernetes Service object alongside the workload. */
  service?: boolean;
  /** Type of Kubernetes resource to generate (e.g. "Deployment"). */
  type?: string;
  /** Namespace to set in the generated YAML. */
  noTrunc?: boolean;
}

export interface GenerateSystemdOptions {
  /** Container/pod name or ID. */
  useName?: boolean;
  /** Create a new container instead of starting an existing one. */
  new?: boolean;
  /** Do not include the header comment. */
  noHeader?: boolean;
  /** Start timeout in seconds. */
  startTimeout?: number;
  /** Stop timeout in seconds. */
  stopTimeout?: number;
  /** Restart policy (e.g. "on-failure", "always"). */
  restartPolicy?: string;
  /** Container prefix for the unit name. */
  containerPrefix?: string;
  /** Pod prefix for the unit name. */
  podPrefix?: string;
  /** Separator between prefix and name. */
  separator?: string;
  /** Wants list of additional units. */
  wants?: string[];
  /** After list of additional units. */
  after?: string[];
  /** Requires list of additional units. */
  requires?: string[];
  /** Additional environment variables. */
  additionalEnvVariables?: string[];
}

export interface KubeApplyOptions {
  /** CA cert file for TLS. */
  caCertFile?: string;
  /** Kubernetes config file path. */
  kubeConfig?: string;
  /** Namespace to apply into. */
  namespace?: string;
  /** Path to save the generated YAML. */
  file?: string;
  /** Service account to use. */
  serviceAccount?: string;
}

export interface PlayKubeOptions {
  /** Annotations to add to pods. */
  annotations?: Record<string, string>;
  /** Auth file for registry credentials. */
  authFile?: string;
  /** CA cert file for TLS. */
  certDir?: string;
  /** Log driver for containers. */
  logDriver?: string;
  /** Log options for containers. */
  logOptions?: string[];
  /** Network mode or network names. */
  network?: string[];
  /** Do not start pods/containers after creation. */
  noHosts?: boolean;
  /** Quiet mode — suppress pull output. */
  quiet?: boolean;
  /** Replace existing pods/containers. */
  replace?: boolean;
  /** Start pods after creation. */
  start?: boolean;
  /** TLS verify for registry. */
  tlsVerify?: boolean;
  /** Username for registry auth. */
  username?: string;
  /** Password for registry auth. */
  password?: string;
  /** Use config maps from these files. */
  configMaps?: string[];
  /** Context directory for build. */
  contextDir?: string;
  /** Build images from Containerfiles. */
  build?: boolean;
}

export class KubeManager {
  constructor(private readonly client: APIClient) {}

  /**
   * Generate a Kubernetes YAML file from one or more containers or pods.
   * @param names - Container/pod names or IDs.
   */
  async generate(names: string | string[], options: GenerateKubeOptions = {}): Promise<string> {
    const nameList = Array.isArray(names) ? names : [names];
    const res = await this.client.get<string>("/generate/kube", {
      params: {
        names: nameList,
        pods: options.pods,
        replicas: options.replicas,
        service: options.service,
        type: options.type,
        noTrunc: options.noTrunc,
      },
      parseAs: "text",
    });
    res.raiseForStatus();
    return res.data;
  }

  /**
   * Generate systemd unit files for a container or pod.
   * @param name - Container or pod name/ID.
   */
  async generateSystemd(
    name: string,
    options: GenerateSystemdOptions = {},
  ): Promise<Record<string, string>> {
    const res = await this.client.get<Record<string, string>>(
      `/generate/${encodeURIComponent(name)}/systemd`,
      {
        params: {
          useName: options.useName,
          new: options.new,
          noHeader: options.noHeader,
          startTimeout: options.startTimeout,
          stopTimeout: options.stopTimeout,
          restartPolicy: options.restartPolicy,
          containerPrefix: options.containerPrefix,
          podPrefix: options.podPrefix,
          separator: options.separator,
          wants: options.wants,
          after: options.after,
          requires: options.requires,
          additionalEnvVariables: options.additionalEnvVariables,
        },
      },
    );
    res.raiseForStatus();
    return res.data;
  }

  /**
   * Apply a Kubernetes YAML workload to a Podman service or a Kubernetes cluster.
   * @param yaml - YAML content as a string.
   */
  async apply(yaml: string, options: KubeApplyOptions = {}): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/kube/apply", {
      params: {
        caCertFile: options.caCertFile,
        kubeConfig: options.kubeConfig,
        namespace: options.namespace,
        file: options.file,
        serviceAccount: options.serviceAccount,
      },
      data: yaml,
      headers: { "Content-Type": "text/plain" },
    });
    res.raiseForStatus();
    return res.data;
  }

  /**
   * Create pods and containers from a Kubernetes YAML file.
   * @param yaml - YAML content as a string.
   */
  async play(yaml: string, options: PlayKubeOptions = {}): Promise<Record<string, unknown>> {
    const res = await this.client.post<Record<string, unknown>>("/play/kube", {
      params: {
        annotations: options.annotations ? JSON.stringify(options.annotations) : undefined,
        authFile: options.authFile,
        certDir: options.certDir,
        logDriver: options.logDriver,
        logOptions: options.logOptions,
        network: options.network,
        noHosts: options.noHosts,
        quiet: options.quiet,
        replace: options.replace,
        start: options.start,
        tlsVerify: options.tlsVerify,
        username: options.username,
        password: options.password,
        configMaps: options.configMaps,
        contextDir: options.contextDir,
        build: options.build,
      },
      data: yaml,
      headers: { "Content-Type": "text/plain" },
    });
    res.raiseForStatus();
    return res.data;
  }

  /**
   * Remove resources created by a previous `play` call.
   * @param yaml - The same YAML used in the original `play` call.
   */
  async playDown(yaml: string, options: { force?: boolean } = {}): Promise<Record<string, unknown>> {
    const res = await this.client.delete<Record<string, unknown>>("/play/kube", {
      params: { force: options.force },
      data: yaml,
      headers: { "Content-Type": "text/plain" },
    });
    res.raiseForStatus();
    return res.data;
  }
}
