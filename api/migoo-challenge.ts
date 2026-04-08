/**
 * Vercel serverless: serves the domain verification token at /.well-known/migoo-verify.txt
 * when the request Host matches a pending custom domain (HTTPS proof, no registrar TXT).
 */
import { projectId, publicAnonKey } from "../utils/supabase/info";

export default async function handler(req: { headers?: { host?: string } }, res: {
  status: (code: number) => { end: (body?: string) => void; send: (body: string) => void };
  setHeader: (name: string, value: string) => void;
}): Promise<void> {
  const host = String(req.headers?.host ?? "").split(":")[0].toLowerCase();
  if (!host) {
    res.status(400).end("");
    return;
  }

  const url =
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/custom-domain/challenge-text?hostname=${
      encodeURIComponent(host)
    }`;

  try {
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        Accept: "text/plain",
      },
    });
    if (!r.ok) {
      res.status(404).end("");
      return;
    }
    const text = await r.text();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(text);
  } catch {
    res.status(502).end("");
  }
}
