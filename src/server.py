from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import time
import base64
import smtplib
import ssl
import re
from email.message import EmailMessage
from dotenv import load_dotenv
from pathlib import Path
from math import floor

# load .env from project root
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent.joinpath(".env"))

PORT = int(os.getenv("PORT", 3000))
MAX_BASE64_BYTES = 6 * 1024 * 1024
RATE_WINDOW_MS = int(os.getenv("RATE_WINDOW_MS", 60_000))
RATE_MAX = int(os.getenv("RATE_MAX", 30))
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN")  # if None, default CORS disabled

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_SECURE = os.getenv("SMTP_SECURE", "false").lower() == "true"
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
EMAIL_FROM = os.getenv("EMAIL_FROM")

_email_re = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

def is_valid_email(e: str) -> bool:
    return isinstance(e, str) and _email_re.match(e)

app = FastAPI()

# configure CORS if ALLOWED_ORIGIN provided
if ALLOWED_ORIGIN:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[ALLOWED_ORIGIN],
        allow_methods=["POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

# naive in-memory rate limiter
_rate_map: dict[str, dict] = {}

def check_rate_limit(ip: str) -> bool:
    now = int(time.time() * 1000)
    entry = _rate_map.get(ip)
    if not entry or now - entry["start"] >= RATE_WINDOW_MS:
        _rate_map[ip] = {"start": now, "count": 1}
        return True
    entry["count"] += 1
    if entry["count"] > RATE_MAX:
        return False
    return True

class SendChartReq(BaseModel):
    to: str
    filename: str | None = "chart.png"
    data: str

def send_email_sync(to: str, filename: str, img_bytes: bytes):
    if not EMAIL_FROM:
        raise RuntimeError("server not configured (EMAIL_FROM)")
    msg = EmailMessage()
    msg["From"] = EMAIL_FROM
    msg["To"] = to
    msg["Subject"] = "Your Bucks2Bar chart"
    msg.set_content("Attached is your chart image.")
    msg.add_attachment(img_bytes, maintype="image", subtype="png", filename=filename)

    context = ssl.create_default_context()
    if SMTP_SECURE and SMTP_PORT == 465:
        smtp = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=30)
    else:
        smtp = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30)
        if SMTP_SECURE:
            smtp.starttls(context=context)
    try:
        if SMTP_USER and SMTP_PASS:
            smtp.login(SMTP_USER, SMTP_PASS)
        smtp.send_message(msg)
    finally:
        smtp.quit()

@app.post("/send-chart")
async def send_chart(req: Request, body: SendChartReq, background: BackgroundTasks):
    ip = req.client.host if req.client else "unknown"
    if not check_rate_limit(ip):
        raise HTTPException(status_code=429, detail="rate limit exceeded")

    if not is_valid_email(body.to):
        raise HTTPException(status_code=400, detail="invalid recipient")

    base64_str = body.data
    if base64_str.startswith("data:"):
        comma_idx = base64_str.find(",")
        if comma_idx != -1:
            base64_str = base64_str[comma_idx + 1 :]

    if len(base64_str) > MAX_BASE64_BYTES:
        raise HTTPException(status_code=413, detail="image too large")

    estimated_bytes = floor((len(base64_str) * 3) / 4)
    if estimated_bytes > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="image too large")

    try:
        img_bytes = base64.b64decode(base64_str, validate=True)
    except (ValueError, base64.binascii.Error):
        raise HTTPException(status_code=400, detail="invalid base64")

    if not SMTP_HOST:
        raise HTTPException(status_code=500, detail="server not configured (SMTP_HOST)")

    # send in background to avoid blocking request
    background.add_task(send_email_sync, body.to, body.filename or "chart.png", img_bytes)
    return JSONResponse({"ok": True})

@app.exception_handler(404)
async def not_found(request: Request, exc):
    return JSONResponse({"error": "not found"}, status_code=404)

# run with: uvicorn src.server:app --host 0.0.0.0 --port 3000
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)