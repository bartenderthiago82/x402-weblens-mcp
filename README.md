# WebLens MCP

Give Claude, Cursor or any MCP client four tools for reading the web. Each call is paid in USDC on Base via [x402](https://x402.org). There is no account, no API key and no subscription.

| Tool | What it returns | Price |
|---|---|---|
| `weblens_metadata` | Title, description, Open Graph, JSON-LD, favicon | $0.002 |
| `weblens_links` | All links, split into internal and external | $0.002 |
| `weblens_extract` | Main content as clean Markdown (no ads, menus or popups) | $0.005 |
| `weblens_structure` | JSON that follows your JSON Schema, from a URL or text | $0.02 |

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
