#!/usr/bin/env node
// WebLens MCP server: gives AI assistants web-reading and utility tools plus the RugProbe token check, paid per call in USDC on Base via x402.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { makeBudgetPolicy } from "./budget.mjs";

const API = (process.env.WEBLENS_API_URL ?? "https://x402-weblens-api-production.up.railway.app").replace(/\/$/, "");
const NETWORK = process.env.WEBLENS_NETWORK ?? "eip155:8453"; // Base mainnet; "eip155:84532" = Base Sepolia testnet
const BUDGET = process.env.WEBLENS_MAX_SPEND_USD ?? "1";
const key = process.env.WEBLENS_WALLET_PRIVATE_KEY;

// stdout is the MCP channel, so all messages go to stderr.
// Without a valid key the server still starts (so clients and directories can list the tools), but every call is refused.
const NO_KEY = "WEBLENS_WALLET_PRIVATE_KEY is missing or invalid. Use a separate wallet holding only a few dollars of USDC on Base.";
const account = key && /^0x[0-9a-fA-F]{64}$/.test(key) ? privateKeyToAccount(key) : null;
if (!account) console.error(NO_KEY);
const budget = makeBudgetPolicy(BUDGET);
const payFetch = account && wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: NETWORK, client: new ExactEvmScheme(account) }],
  spendControls: { maxAmountPerPayment: "$0.05" }, // no single WebLens call costs more than $0.05
  policies: [budget.policy],
});

async function call(path, init) {
  if (!payFetch) return fail(NO_KEY);
  let res;
  try {
    res = await payFetch(`${API}${path}`, init);
  } catch (e) {
    const spent = Number(budget.state.spent) / 1e6;
    return fail(`Payment not made: ${e.message}. Spent this session: $${spent.toFixed(3)} of $${BUDGET} limit.`);
  }
  const text = await res.text();
  if (!res.ok) return fail(`WebLens returned ${res.status}: ${text.slice(0, 500)}`);
  return { content: [{ type: "text", text }] };
}
const fail = (msg) => ({ content: [{ type: "text", text: msg }], isError: true });
const get = (route, url) => call(`${route}?url=${encodeURIComponent(url)}`);

const server = new McpServer({ name: "weblens", version: "1.4.0" });
const url = z.string().url().describe("Public http(s) URL of the page");

server.registerTool("weblens_metadata", {
  title: "Page metadata ($0.002)",
  description: "Get a web page's title, description, Open Graph tags, JSON-LD and favicon. Costs $0.002 USDC.",
  inputSchema: { url },
}, ({ url }) => get("/v1/metadata", url));

server.registerTool("weblens_links", {
  title: "Page links ($0.002)",
  description: "List all links on a web page, split into internal and external. Costs $0.002 USDC.",
  inputSchema: { url },
}, ({ url }) => get("/v1/links", url));

server.registerTool("weblens_extract", {
  title: "Clean page text ($0.005)",
  description: "Get the main content of a web page as clean Markdown, without ads, menus or popups. Costs $0.005 USDC.",
  inputSchema: { url },
}, ({ url }) => get("/v1/extract", url));

server.registerTool("weblens_structure", {
  title: "Structured data ($0.02)",
  description: "Turn a web page (url) or raw text into JSON that follows the JSON Schema you send. Costs $0.02 USDC.",
  inputSchema: {
    url: url.optional(),
    text: z.string().max(50_000).optional().describe("Raw text to structure, instead of a url"),
    schema: z.record(z.string(), z.any()).describe("JSON Schema the result must follow"),
    instructions: z.string().max(2000).optional().describe("Extra instructions for the extraction"),
  },
}, (args) => {
  if (!args.url && !args.text) return fail("Send either 'url' or 'text'.");
  return call("/v1/structure", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) });
});

server.registerTool("rugprobe_check", {
  title: "RugProbe token safety check ($0.01)",
  description:
    "Check an ERC-20 token on Base before trading: simulated buy and sell (honeypot, real buy/sell tax), liquidity, " +
    "LP burn, owner powers (mint, blacklist, fees, pause), upgradeable proxy, and a 0-100 risk score. " +
    "Automated on-chain heuristics, not financial advice. Costs $0.01 USDC.",
  inputSchema: { address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("Token contract address on Base (0x...)") },
}, ({ address }) => call(`/v1/token-safety?address=${address}`));

server.registerTool("rugprobe_report", {
  title: "RugProbe Report: token due diligence ($0.05)",
  description:
    "Full due diligence on a Base token in one call: everything rugprobe_check does, plus the project's website " +
    "(does it really list this contract? fake-site check, domain age, socials), a clear/caution/avoid verdict, " +
    "a 0-100 risk score and a short summary. Automated risk signals, not financial advice. Costs $0.05 USDC.",
  inputSchema: {
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("Token contract address on Base (0x...)"),
    website: url.optional().describe("The project's official website (optional, enables the website checks)"),
  },
}, ({ address, website }) =>
  call(`/v1/token-report?address=${address}${website ? `&website=${encodeURIComponent(website)}` : ""}`));

const post = (route, body) => call(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

server.registerTool("rugprobe_position_size", {
  title: "Position size & ATR stop ($0.002)",
  description: "Position size and stop-loss from account risk: give price bars (high/low/close, oldest first) or an ATR plus entry, the account size and risk %. Returns Wilder ATR, stop price, units and position value. Math only, not financial advice. Costs $0.002 USDC.",
  inputSchema: {
    accountSize: z.number().positive().describe("Account size"),
    riskPct: z.number().positive().max(100).describe("Percent of the account to risk, e.g. 1"),
    bars: z.array(z.object({ high: z.number(), low: z.number(), close: z.number() })).max(5000).optional().describe("Price bars, oldest first"),
    atr: z.number().nonnegative().optional().describe("ATR, if you already have it (then also send entry)"),
    entry: z.number().positive().optional().describe("Entry price (default: last close)"),
    period: z.number().int().min(1).max(500).optional().describe("ATR period (default 14)"),
    multiplier: z.number().positive().max(20).optional().describe("Stop distance in ATRs (default 2)"),
    side: z.enum(["long", "short"]).optional(),
  },
}, (args) => post("/v1/position-size", args));

server.registerTool("rugprobe_gas", {
  title: "Base gas advisor ($0.002)",
  description: "Should I submit a Base transaction now or wait? Returns next base fee, block fullness, slow/normal/fast EIP-1559 fee suggestions and the estimated USD cost of a transfer and a swap. Costs $0.002 USDC.",
  inputSchema: {},
}, () => call("/v1/gas"));

server.registerTool("weblens_csv_to_json", {
  title: "CSV to typed JSON ($0.002)",
  description: "Convert CSV text to JSON rows with snake_case keys and a detected type per column (integer, number, boolean, date, datetime, string). Delimiter is auto-detected. Costs $0.002 USDC.",
  inputSchema: {
    csv: z.string().min(1).max(90_000).describe("CSV text"),
    delimiter: z.string().length(1).optional().describe("Optional delimiter"),
    header: z.boolean().optional().describe("First row is the header (default true)"),
  },
}, (args) => post("/v1/csv-to-json", args));

server.registerTool("weblens_json_repair", {
  title: "Repair & validate JSON ($0.002)",
  description: "Fix broken JSON (code fences, comments, single quotes, bare keys, trailing commas, Python literals, cut-off endings) and optionally validate it against a JSON Schema (no regex patterns). Costs $0.002 USDC.",
  inputSchema: {
    text: z.string().min(1).max(90_000).describe("The broken JSON text"),
    schema: z.record(z.string(), z.any()).optional().describe("Optional JSON Schema to validate against"),
  },
}, (args) => post("/v1/json-repair", args));

server.registerTool("weblens_qr", {
  title: "QR code ($0.002)",
  description: "Turn any text, URL, Wi-Fi string or payment link into a QR code, returned as SVG markup or a base64 PNG. Costs $0.002 USDC.",
  inputSchema: {
    text: z.string().min(1).max(2000).describe("Text or URL to encode"),
    format: z.enum(["svg", "png"]).optional().describe("Output format (default svg)"),
    size: z.number().int().min(64).max(2048).optional().describe("Width in pixels (default 512)"),
    ecc: z.enum(["L", "M", "Q", "H"]).optional().describe("Error correction level (default M)"),
  },
}, (args) => call(`/v1/qr?${new URLSearchParams(Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))}`));

server.registerTool("weblens_wiki_summary", {
  title: "Wikipedia summary ($0.002)",
  description: "Short Wikipedia summary of any topic in any Wikipedia language: title, description, intro paragraph, article URL, thumbnail and CC BY-SA attribution. Finds the closest article if the topic is not an exact title. Costs $0.002 USDC.",
  inputSchema: {
    topic: z.string().min(1).max(300).describe("Topic or article title"),
    lang: z.string().regex(/^[a-z]{2,3}(-[a-z]{2,8})?$/).optional().describe("Wikipedia language code: en, pt, es, de... (default en)"),
  },
}, ({ topic, lang }) => call(`/v1/wiki-summary?topic=${encodeURIComponent(topic)}${lang ? `&lang=${lang}` : ""}`));

await server.connect(new StdioServerTransport());
console.error(account
  ? `WebLens MCP ready. Paying from ${account.address} on ${NETWORK}, session limit $${BUDGET}.`
  : "WebLens MCP ready, but no wallet: calls are refused until WEBLENS_WALLET_PRIVATE_KEY is set.");
