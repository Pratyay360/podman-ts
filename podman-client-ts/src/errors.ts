/** Podman API error classes */

export class PodmanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PodmanError";
  }
}

/** Wraps HTTP errors returned by the Podman service. */
export class APIError extends PodmanError {
  statusCode?: number;
  explanation?: string;

  constructor(message: string, statusCode?: number, explanation?: string) {
    super(message);
    this.name = "APIError";
    this.statusCode = statusCode;
    this.explanation = explanation;
  }

  isClientError(): boolean {
    return (this.statusCode ?? 0) >= 400 && (this.statusCode ?? 0) < 500;
  }

  isServerError(): boolean {
    return (this.statusCode ?? 0) >= 500 && (this.statusCode ?? 0) < 600;
  }

  toString(): string {
    let msg = this.message;
    if (this.isClientError()) msg = `${this.statusCode} Client Error: ${msg}`;
    else if (this.isServerError()) msg = `${this.statusCode} Server Error: ${msg}`;
    if (this.explanation) msg = `${msg} (${this.explanation})`;
    return msg;
  }
}

/** Resource not found on Podman service (404). */
export class NotFound extends APIError {
  constructor(message: string, explanation?: string) {
    super(message, 404, explanation);
    this.name = "NotFound";
  }
}

/** Image not found on Podman service. */
export class ImageNotFound extends APIError {
  constructor(message: string, explanation?: string) {
    super(message, 404, explanation);
    this.name = "ImageNotFound";
  }
}

/** Build operation failure. */
export class BuildError extends PodmanError {
  buildLog: string[];
  constructor(message: string, buildLog: string[] = []) {
    super(message);
    this.name = "BuildError";
    this.buildLog = buildLog;
  }
}

/** Container exited with a non-zero status. */
export class ContainerError extends PodmanError {
  exitStatus: number;
  constructor(message: string, exitStatus: number) {
    super(message);
    this.name = "ContainerError";
    this.exitStatus = exitStatus;
  }
}

/** Invalid argument passed to an API call. */
export class InvalidArgument extends PodmanError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidArgument";
  }
}

/** Error parsing a JSON stream from the service. */
export class StreamParseError extends PodmanError {
  constructor(cause: unknown) {
    super(`Stream parse error: ${cause}`);
    this.name = "StreamParseError";
  }
}
