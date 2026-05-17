#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

const DEFAULT_API_URL = "https://api.minimax.io/v1/t2a_v2";

const DEFAULTS = {
  model: "speech-02-hd",
  voiceId: "Chinese (Mandarin)_Reliable_Executive",
  speed: 1,
  volume: 1,
  pitch: 0,
  sampleRate: 32000,
  bitrate: 128000,
  format: "mp3",
  channel: 1,
};

function usage() {
  return `
Usage:
  node tools/minimax_tts.mjs --text "要合成的文本" --out assets/audio/sample.mp3
  node tools/minimax_tts.mjs --input scripts/final_narration.md --out assets/audio/narration.mp3

Required:
  MINIMAX_API_KEY environment variable, or --api-key
  --text or --input
  --out

Options:
  --model       Default: ${DEFAULTS.model}
  --voice-id    Default: ${DEFAULTS.voiceId}
  --speed       0.5-2.0, default: ${DEFAULTS.speed}
  --volume      0-10, default: ${DEFAULTS.volume}
  --pitch       -12 to 12, default: ${DEFAULTS.pitch}
  --format      mp3|wav|pcm|flac, default: ${DEFAULTS.format}
  --sample-rate Default: ${DEFAULTS.sampleRate}
  --bitrate     Default: ${DEFAULTS.bitrate}
  --channel     Default: ${DEFAULTS.channel}
  --api-url     Default: ${DEFAULT_API_URL}
  --meta-out    Metadata JSON output path
`;
}

function parseArgs(argv) {
  const args = {};

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const eqIndex = token.indexOf("=");
    if (eqIndex !== -1) {
      args[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    i += 1;
  }

  return args;
}

function numberArg(args, name, fallback) {
  if (args[name] === undefined) return fallback;
  const value = Number(args[name]);
  if (!Number.isFinite(value)) {
    throw new Error(`--${name} must be a number`);
  }
  return value;
}

function outputFormat(outPath, explicitFormat) {
  if (explicitFormat) return explicitFormat.toLowerCase();
  const ext = extname(outPath).replace(".", "").toLowerCase();
  return ext || DEFAULTS.format;
}

function assertBaseResponseOk(json) {
  const base = json?.base_resp ?? json?.baseResp;
  if (!base) return;

  const code = base.status_code ?? base.statusCode;
  if (code !== undefined && code !== 0) {
    const message = base.status_msg ?? base.statusMsg ?? "MiniMax request failed";
    throw new Error(`MiniMax error ${code}: ${message}`);
  }
}

async function readText(args) {
  if (args.text) return args.text;
  if (args.input) return readFile(resolve(args.input), "utf8");
  throw new Error("Provide --text or --input");
}

async function downloadUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Audio URL download failed: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const apiKey = args["api-key"] ?? process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("Set MINIMAX_API_KEY or pass --api-key");
  }

  const outPath = args.out ? resolve(args.out) : null;
  if (!outPath) throw new Error("Provide --out");

  const format = outputFormat(outPath, args.format);
  const text = (await readText(args)).trim();
  if (!text) throw new Error("Input text is empty");

  const payload = {
    model: args.model ?? DEFAULTS.model,
    text,
    stream: false,
    output_format: "hex",
    voice_setting: {
      voice_id: args["voice-id"] ?? DEFAULTS.voiceId,
      speed: numberArg(args, "speed", DEFAULTS.speed),
      vol: numberArg(args, "volume", DEFAULTS.volume),
      pitch: numberArg(args, "pitch", DEFAULTS.pitch),
    },
    audio_setting: {
      sample_rate: numberArg(args, "sample-rate", DEFAULTS.sampleRate),
      bitrate: numberArg(args, "bitrate", DEFAULTS.bitrate),
      format,
      channel: numberArg(args, "channel", DEFAULTS.channel),
    },
  };
  const apiUrl = args["api-url"] ?? process.env.MINIMAX_API_URL ?? DEFAULT_API_URL;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let json;
  try {
    json = JSON.parse(responseText);
  } catch {
    throw new Error(`MiniMax returned non-JSON response: HTTP ${response.status} ${responseText.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`MiniMax HTTP ${response.status}: ${responseText.slice(0, 500)}`);
  }
  assertBaseResponseOk(json);

  const audioHex = json?.data?.audio;
  const audioUrl = json?.data?.audio_url ?? json?.data?.audioUrl ?? json?.data?.url;
  let audioBuffer;

  if (typeof audioHex === "string" && audioHex.length > 0) {
    audioBuffer = Buffer.from(audioHex, "hex");
  } else if (typeof audioUrl === "string" && audioUrl.length > 0) {
    audioBuffer = await downloadUrl(audioUrl);
  } else {
    throw new Error(`MiniMax response did not contain audio data: ${responseText.slice(0, 500)}`);
  }

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, audioBuffer);

  const metaPath = args["meta-out"]
    ? resolve(args["meta-out"])
    : `${outPath}.json`;
  const meta = {
    created_at: new Date().toISOString(),
    request: {
      api_url: apiUrl,
      ...payload,
      text,
    },
    response: {
      extra_info: json.extra_info ?? json.extraInfo ?? null,
      trace_id: json.trace_id ?? json.traceId ?? null,
      base_resp: json.base_resp ?? json.baseResp ?? null,
      output_bytes: audioBuffer.length,
      output: outPath,
    },
  };
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  process.stdout.write(`Wrote ${outPath}\nMetadata ${metaPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
