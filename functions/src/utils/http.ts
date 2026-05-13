export type HttpRequest = {
  method: string;
  path?: string;
  url?: string;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
};

export type HttpResponse = {
  set: (field: string, value: string) => HttpResponse;
  status: (code: number) => HttpResponse;
  json: (body: unknown) => void;
  send: (body?: unknown) => void;
};

/**
 * Error used by REST handlers to return intentional HTTP responses.
 */
export class HttpError extends Error {
  readonly statusCode: number;

  /**
   * Builds an HTTP error with a stable response code and machine message.
   *
   * @param {number} statusCode HTTP status code.
   * @param {string} message Machine-readable response message.
   */
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const applyCors = (request: HttpRequest, response: HttpResponse): boolean => {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type");
  response.set("Access-Control-Max-Age", "3600");

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return true;
  }

  return false;
};

export const requireGet = (request: HttpRequest): void => {
  if (request.method !== "GET") {
    throw new HttpError(405, "method_not_allowed");
  }
};

export const requirePost = (request: HttpRequest): void => {
  if (request.method !== "POST") {
    throw new HttpError(405, "method_not_allowed");
  }
};

export const sendHttpError = (response: HttpResponse, error: unknown): void => {
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      error: error.message,
    });
    return;
  }

  response.status(500).json({
    error: error instanceof Error ? error.message : "internal_error",
  });
};
