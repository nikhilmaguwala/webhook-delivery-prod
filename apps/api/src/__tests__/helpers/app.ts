import app from "../../app";
import type { Env } from "../../types";

export async function requestApp(
  path: string,
  init: RequestInit & { env: Env }
): Promise<Response> {
  const request = new Request(`http://localhost${path}`, init);
  return app.fetch(request, init.env);
}
