# WebLens MCP

Give Claude, Cursor or any MCP client tools for reading the web, QR codes, Wikipedia summaries and data cleanup, plus **RugProbe** to check a Base token before trading. Each call is paid in USDC on Base via [x402](https://x402.org). There is no account, no API key and no subscription.

| Tool | What it returns | Price |
|---|---|---|
| `weblens_metadata` | Title, description, Open Graph, JSON-LD, favicon | $0.002 |
| `weblens_links` | All links, split into internal and external | $0.002 |
| `weblens_extract` | Main content as clean Markdown (no ads, menus or popups) | $0.005 |
| `weblens_structure` | JSON that follows your JSON Schema, from a URL or text | $0.02 |
| `rugprobe_check` | **RugProbe**: is this Base token safe to trade? Simulated buy/sell (honeypot, real taxes), liquidity, owner powers, 0-100 risk score | $0.01 |
| `rugprobe_report` | **RugProbe Report**: everything above plus the project website (does it list this contract? domain age, socials), a clear/caution/avoid verdict and a short summary | $0.05 |
| `rugprobe_position_size` | Stop-loss and position size from account risk % and ATR | $0.002 |
| `rugprobe_gas` | Base gas advisor: submit now or wait, fee suggestions, USD cost | $0.002 |
| `weblens_csv_to_json` | CSV to typed JSON rows (snake_case keys, column types) | $0.002 |
| `weblens_json_repair` | Fix broken LLM JSON and validate it against a schema | $0.002 |
| `weblens_qr` | QR code from any text or URL, as SVG or PNG | $0.002 |
| `weblens_wiki_summary` | Wikipedia summary of any topic, any language, with attribution | $0.002 |

## Setup

1. Create a **separate wallet** for this and put a few dollars of USDC on **Base** in it. Never use your main wallet.
2. Add the server to your MCP client. For Claude Desktop, put this in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "weblens": {
      "command": "npx",
      "args": ["-y", "x402-weblens-mcp"],
      "env": {
        "WEBLENS_WALLET_PRIVATE_KEY": "0x...",
        "WEBLENS_MAX_SPEND_USD": "1"
      }
    }
  }
}
```

For Claude Code: `claude mcp add weblens -e WEBLENS_WALLET_PRIVATE_KEY=0x... -- npx -y x402-weblens-mcp`

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `WEBLENS_WALLET_PRIVATE_KEY` | required | Key of the wallet that pays. It stays on your computer and is only used to sign each payment. |
| `WEBLENS_MAX_SPEND_USD` | `1` | The most the server may spend in one session; further payments are refused. |
| `WEBLENS_NETWORK` | `eip155:8453` | Base mainnet. Use `eip155:84532` for Base Sepolia testnet. |
| `WEBLENS_API_URL` | WebLens production | API address. |

Safety: no single payment may exceed $0.05. Failed requests (status 400 or above) are not charged.

HTTP API and docs: https://x402-weblens-api-production.up.railway.app
