import PostalMime from "postal-mime";

export interface Env {
  EMAIL_INTAKE_SECRET: string;
  INTAKE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

function toBase64(content: ArrayBuffer | Uint8Array | string, encoding?: string): string {
  if (typeof content === "string") {
    // postal-mime already gives us a base64 string for some encodings.
    return encoding === "base64" ? content : btoa(content);
  }
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext) {
    try {
      const parsed = await PostalMime.parse(message.raw);

      const pdfAttachments = (parsed.attachments || []).filter((a) =>
        (a.mimeType || "").toLowerCase().includes("pdf") ||
        /\.pdf$/i.test(a.filename || "")
      );

      if (!pdfAttachments.length) {
        console.log("zap-ratecon-email-worker: no PDF attachments, skipping", message.to);
        return;
      }

      const attachments = pdfAttachments.map((a) => ({
        filename: a.filename || "ratecon.pdf",
        contentType: a.mimeType || "application/pdf",
        contentBase64: toBase64(a.content, a.encoding),
      }));

      const res = await fetch(env.INTAKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
          "apikey": env.SUPABASE_PUBLISHABLE_KEY,
          "X-Intake-Secret": env.EMAIL_INTAKE_SECRET,
        },
        body: JSON.stringify({ to: message.to, attachments }),
      });

      const resultText = await res.text();
      console.log("zap-ratecon-email-worker: intake response", res.status, resultText);
    } catch (error) {
      console.error("zap-ratecon-email-worker: failed to process message", error);
    }
  },
};
