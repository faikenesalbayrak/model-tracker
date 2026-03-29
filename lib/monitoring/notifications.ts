import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface Top10ChangeRow {
  modelName: string;
  vendor?: string;
  changeType: "entered" | "exited" | "moved";
  rankBefore?: number | null;
  rankAfter?: number | null;
}

export interface SendTop10AlertEmailInput {
  to: string[];
  category: string;
  sourceName: string;
  runTimeIso: string;
  changes: Top10ChangeRow[];
  subjectPrefix?: string;
}

type MailTransportResult = {
  messageId: string;
};

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required SMTP env: ${name}`);
  }
  return value;
}

function readBoolEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  return value === "1" || value === "true" || value === "yes";
}

function getPythonBinary(): string {
  return process.env.PYTHON_BIN?.trim() || "python3";
}

function getRenderScriptPath(): string {
  const custom = process.env.ALERT_IMAGE_SCRIPT_PATH?.trim();
  if (custom) {
    return custom;
  }
  return path.join(process.cwd(), "scripts", "render_alert_image.py");
}

async function getNodemailerTransport() {
  // Use require to avoid static module-resolution errors when package is not yet installed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodemailer = require("nodemailer") as {
    createTransport: (options: Record<string, unknown>) => {
      sendMail: (mail: Record<string, unknown>) => Promise<{ messageId: string }>;
    };
  };

  const host = readRequiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = readRequiredEnv("SMTP_USER");
  const pass = readRequiredEnv("SMTP_PASS");
  const secure = readBoolEnv("SMTP_SECURE", port === 465);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

function buildTop10AlertSubject(input: SendTop10AlertEmailInput): string {
  const prefix = input.subjectPrefix?.trim();
  const lead = prefix ? `${prefix} ` : "";
  return `${lead}[Top10 Alert] ${input.category} changed (${input.changes.length} event${input.changes.length === 1 ? "" : "s"})`;
}

function buildTop10AlertHtml(input: SendTop10AlertEmailInput): string {
  const rows = input.changes
    .map((change) => {
      const from = typeof change.rankBefore === "number" ? `#${change.rankBefore}` : "-";
      const to = typeof change.rankAfter === "number" ? `#${change.rankAfter}` : "-";
      const vendor = change.vendor ? ` (${change.vendor})` : "";
      return `<li><strong>${change.modelName}</strong>${vendor} - ${change.changeType.toUpperCase()} [${from} -> ${to}]</li>`;
    })
    .join("");

  return `
    <h2>Top 10 Ranking Update</h2>
    <p><strong>Category:</strong> ${input.category}</p>
    <p><strong>Source:</strong> ${input.sourceName}</p>
    <p><strong>Run time:</strong> ${input.runTimeIso}</p>
    <ul>${rows}</ul>
  `;
}


async function cleanupTempDir(tempDir: string): Promise<void> {
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function sendMail(options: {
  to: string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; path: string; cid?: string }>;
}): Promise<MailTransportResult> {
  const from = process.env.SMTP_FROM?.trim() || readRequiredEnv("SMTP_USER");
  const transport = await getNodemailerTransport();
  const sent = await transport.sendMail({
    from,
    to: options.to.join(","),
    subject: options.subject,
    html: options.html,
    attachments: options.attachments ?? [],
  });

  return { messageId: sent.messageId };
}

export async function sendTop10AlertEmail(input: SendTop10AlertEmailInput): Promise<MailTransportResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mt-alert-"));
  const payloadPath = path.join(tempDir, "payload.json");
  const outputPath = path.join(tempDir, "alert.png");
  const payload = {
    title: `Top 10 changed: ${input.category}`,
    subtitle: `${input.sourceName} @ ${input.runTimeIso}`,
    rows: input.changes.map((change) => ({
      model: change.modelName,
      vendor: change.vendor ?? "",
      type: change.changeType,
      before: change.rankBefore,
      after: change.rankAfter,
    })),
  };

  try {
    await fs.writeFile(payloadPath, JSON.stringify(payload, null, 2), "utf8");
    try {
      await execFileAsync(getPythonBinary(), [getRenderScriptPath(), payloadPath, outputPath]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`Alert image render skipped: ${detail}`);
    }

    const subject = buildTop10AlertSubject(input);
    let html = buildTop10AlertHtml(input);
    const attachments: Array<{ filename: string; path: string; cid?: string }> = [];

    try {
      await fs.access(outputPath);
      attachments.push({
        filename: "top10-alert.png",
        path: outputPath,
        cid: "top10_alert_image",
      });
      html += `<p><img src="cid:top10_alert_image" alt="Top10 alert visual" /></p>`;
    } catch {
      // Proceed without the rendered image if it is missing.
    }

    return await sendMail({
      to: input.to,
      subject,
      html,
      attachments,
    });
  } finally {
    await cleanupTempDir(tempDir);
  }
}
