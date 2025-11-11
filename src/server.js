// Minimal Node.js server that accepts JSON { to, filename, data } where data is base64 PNG.
// Requires environment variables: SMTP_HOST, SMTP_PORT, SMTP_SECURE ('true'|'false'), SMTP_USER, SMTP_PASS, EMAIL_FROM, SEND_API_KEY (optional)
const express = require("express")
const nodemailer = require("nodemailer")
// ...existing code...
const path = require("path")
// load .env from project root (explicit so running from src/ still picks it up)
require("dotenv").config({ path: path.join(__dirname, "..", ".env") })

const PORT = process.env.PORT || 3000
const MAX_BASE64_BYTES = 6 * 1024 * 1024 // roughly allow ~6MB base64 (~4.5MB binary)
const API_KEY = process.env.SEND_API_KEY // optional API key header
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://127.0.0.1:5500" // optional, e.g. "http://localhost:5500"
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60_000) // 1 minute
const RATE_MAX = Number(process.env.RATE_MAX || 30) // max requests per window per IP

const app = express()

// body parser with size limit
app.use(express.json({ limit: "10mb" }))

// simple CORS handling (no extra deps)
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (ALLOWED_ORIGIN) {
    if (origin === ALLOWED_ORIGIN) {
      res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
      res.setHeader("Access-Control-Allow-Headers", "Content-Type")
      //   res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    }
  } else if (origin) {
    // if no ALLOWED_ORIGIN configured, disallow cross-origin requests by default
  }
  if (req.method === "OPTIONS") return res.sendStatus(204)
  next()
})

// very small in-memory rate limiter (per-IP)
const rateMap = new Map()
function checkRateLimit(ip) {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now - entry.start >= RATE_WINDOW_MS) {
    rateMap.set(ip, { start: now, count: 1 })
    return true
  }
  entry.count += 1
  if (entry.count > RATE_MAX) return false
  return true
}

function isValidEmail(e) {
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

app.post("/send-chart", async (req, res) => {
  try {
    // API key check (optional)
    // if (API_KEY && req.header("x-api-key") !== API_KEY) {
    //   return res.status(401).json({ error: "unauthorized" })
    // }

    // rate limiting
    const ip = req.ip || req.connection.remoteAddress || "unknown"
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: "rate limit exceeded" })
    }

    const { to, filename, data } = req.body || {}

    if (!isValidEmail(to)) {
      return res.status(400).json({ error: "invalid recipient" })
    }
    if (!data || typeof data !== "string") {
      return res.status(400).json({ error: "no image data" })
    }

    // strip data URL prefix if present
    let base64 = data
    const commaIdx = base64.indexOf(",")
    if (base64.startsWith("data:") && commaIdx !== -1)
      base64 = base64.slice(commaIdx + 1)

    // quick size check on base64 string
    if (base64.length > MAX_BASE64_BYTES) {
      return res.status(413).json({ error: "image too large" })
    }

    // estimate binary size and enforce limit ~5MB
    const estimatedBytes = Math.floor((base64.length * 3) / 4)
    if (estimatedBytes > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "image too large" })
    }

    // prepare transporter from env (server-side secrets only)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    //verify transporter configuration
    try {
      transporter
        .verify()
        .then(() => console.log("SMTP transporter verified"))
        .catch((err) => {
          console.error(
            "SMTP verify failed:",
            err && err.message ? err.message : err
          )
          // do not exit here if you want the server available for other routes; consider exit in prod
        })
    } catch (err) {
      console.error(
        "Failed to create SMTP transporter:",
        err && err.message ? err.message : err
      )
    }

    const from = process.env.EMAIL_FROM
    if (!from)
      return res
        .status(500)
        .json({ error: "server not configured (EMAIL_FROM)" })

    const buffer = Buffer.from(base64, "base64")

    await transporter.sendMail({
      from,
      to,
      subject: "Your Bucks2Bar chart",
      text: "Attached is your chart image.",
      attachments: [
        {
          filename: filename || "chart.png",
          content: buffer,
          contentType: "image/png",
        },
      ],
    })

    return res.json({ ok: true })
  } catch (err) {
    console.error("send-chart error:", err && err.message ? err.message : err)
    return res.status(500).json({ error: "internal error" })
  }
})

app.use((req, res) => res.status(404).json({ error: "not found" }))

app.listen(PORT, () =>
  console.log(`Email sender (express) running on :${PORT}`)
)
