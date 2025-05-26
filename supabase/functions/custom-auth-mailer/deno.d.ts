/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="dom" />

interface Deno {
  env: {
    get(key: string): string | undefined;
  };
}

declare const Deno: Deno;

declare module "https://deno.land/std@0.177.0/http/server.ts" {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "https://esm.sh/standardwebhooks@1.0.0" {
  export class Webhook {
    constructor(secret: string);
    verify(payload: string, headers: Record<string, string>): unknown;
  }
}