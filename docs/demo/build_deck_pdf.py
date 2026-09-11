#!/usr/bin/env python3
"""Render the 6-slide manatee pitch as a landscape PDF for DoraHacks."""

from pathlib import Path

from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "manatee-deck.pdf"
ICON = ROOT.parent.parent / "web" / "public" / "apple-touch-icon.png"
FONTS = Path("/System/Library/Fonts/Supplemental")

pdfmetrics.registerFont(TTFont("Arial", str(FONTS / "Arial.ttf")))
pdfmetrics.registerFont(TTFont("Arial-Bold", str(FONTS / "Arial Bold.ttf")))
pdfmetrics.registerFont(TTFont("Arial-Black", str(FONTS / "Arial Black.ttf")))
pdfmetrics.registerFont(TTFont("CourierNew", str(FONTS / "Courier New.ttf")))

# LAYOUT_WIDE
W, H = 13.3 * inch, 7.5 * inch
PAPER = (0.965, 0.945, 0.910)
WHITE = (1.0, 0.988, 0.969)
INK = (0.090, 0.090, 0.090)
MUTED = (0.357, 0.392, 0.459)
YELLOW = (0.961, 0.769, 0.000)
BLUE = (0.184, 0.420, 1.000)


def rgb(c):
    return tuple(int(x * 255) for x in c)


def set_fill(c, color):
    c.setFillColorRGB(*color)


def set_stroke(c, color):
    c.setStrokeColorRGB(*color)


def rounded_rect(c, x, y, w, h, r, fill=None, stroke=None, sw=1.5):
    c.saveState()
    if fill:
        set_fill(c, fill)
    if stroke:
        set_stroke(c, stroke)
        c.setLineWidth(sw)
    else:
        c.setStrokeColorRGB(*fill if fill else INK)
        c.setLineWidth(0)
    c.roundRect(x, y, w, h, r, fill=1 if fill else 0, stroke=1 if stroke else 0)
    c.restoreState()


def wrap(text, font, size, max_w, c):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if c.stringWidth(trial, font, size) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_wrapped(c, text, x, y_top, font, size, max_w, color, leading=None):
    leading = leading or size * 1.28
    set_fill(c, color)
    c.setFont(font, size)
    y = y_top
    for line in wrap(text, font, size, max_w, c):
        c.drawString(x, y, line)
        y -= leading
    return y


def footer(c, n, dark=False):
    set_fill(c, (0.75, 0.75, 0.75) if dark else MUTED)
    c.setFont("Arial", 11)
    c.drawString(0.7 * inch, 0.32 * inch, "BUIDL CTC 2026 Fall  ·  DeFi  ·  Attestcoin")
    c.drawRightString(W - 0.6 * inch, 0.32 * inch, f"{n} / 6")


def slide_bg(c, color):
    set_fill(c, color)
    c.rect(0, 0, W, H, fill=1, stroke=0)


def draw_icon(c, x, y, size):
    if ICON.exists():
        c.drawImage(str(ICON), x, y, width=size, height=size, mask="auto")


def slide1(c):
    slide_bg(c, PAPER)
    draw_icon(c, 0.7 * inch, H - 2.75 * inch, 1.15 * inch)
    set_fill(c, INK)
    c.setFont("Arial-Black", 54)
    c.drawString(2.05 * inch, H - 2.45 * inch, "manatee")
    c.setFont("Arial", 22)
    c.drawString(0.7 * inch, H - 3.45 * inch, "Social cross-chain send. Tweet is UX. Attestcoin settles.")
    rounded_rect(
        c,
        0.7 * inch,
        H - 4.45 * inch,
        5.55 * inch,
        0.55 * inch,
        8,
        fill=YELLOW,
    )
    set_fill(c, INK)
    c.setFont("CourierNew", 14)
    c.drawString(0.9 * inch, H - 4.28 * inch, "@ManateeWallet send 10 mtee @bob")
    y = H - 5.05 * inch
    y = draw_wrapped(
        c,
        "Lock allowlisted ERC-20 on Ethereum Sepolia  →  Attestcoin verifies the event  →  mint on Creditcoin CC3. Recipient and token come from the attested log. CTC is gas only.",
        0.7 * inch,
        y,
        "Arial",
        16,
        11.8 * inch,
        MUTED,
        leading=20,
    )
    set_fill(c, BLUE)
    c.setFont("Arial", 14)
    c.drawString(0.7 * inch, 1.05 * inch, "Live  manatee-production.up.railway.app     Repo  github.com/ducnmm/manatee")
    footer(c, 1)


def slide2(c):
    slide_bg(c, PAPER)
    set_fill(c, INK)
    c.setFont("Arial-Black", 32)
    c.drawString(0.7 * inch, H - 0.95 * inch, "The problem")
    cards = [
        ("1", False, "Centralized bots", "A social bot that “sends” can pick a different recipient or ticker after you tweet. You are trusting the operator."),
        ("2", False, "Naive bridges", "Many testnet bridges mint from an off-chain watcher. If the watcher lies, the destination chain still mints."),
        ("3", True, "What we want", "The tweet builds the lock. After Attestcoin verifies Sepolia, Creditcoin mints only to the event’s to and token."),
    ]
    for i, (n, accent, title, body) in enumerate(cards):
        x = 0.7 * inch + i * 4.15 * inch
        y = 0.85 * inch
        rounded_rect(c, x, y, 3.9 * inch, 5.05 * inch, 10, fill=WHITE, stroke=INK, sw=1.5)
        badge_fill = YELLOW if accent else INK
        badge_y = y + 4.35 * inch
        rounded_rect(c, x + 0.28 * inch, badge_y, 0.42 * inch, 0.42 * inch, 6, fill=badge_fill)
        set_fill(c, INK if accent else WHITE)
        c.setFont("Arial-Black", 14)
        c.drawCentredString(x + 0.49 * inch, badge_y + 0.12 * inch, n)
        set_fill(c, INK)
        c.setFont("Arial-Black", 18)
        c.drawString(x + 0.28 * inch, y + 3.75 * inch, title)
        draw_wrapped(
            c,
            body,
            x + 0.28 * inch,
            y + 3.25 * inch,
            "Arial",
            15,
            3.35 * inch,
            MUTED,
            leading=20,
        )
    footer(c, 2)


def slide3(c):
    slide_bg(c, PAPER)
    set_fill(c, INK)
    c.setFont("Arial-Black", 32)
    c.drawString(0.7 * inch, H - 0.95 * inch, "How it works")
    steps = [
        ("1", "Tweet", "@ManateeWallet send 1 mtee @AJEnglish"),
        ("2", "Lock Sepolia", "ManateeLock.emit TokensSentForBridging(from, to, token, amount)"),
        ("3", "Attest ~8–10 min", "usc-sdk waits for height, then Merkle + continuity proofs"),
        ("4", "Mint CC3", "ManateeMint: receiptStatus, lock address, replay, mint event.to"),
    ]
    for i, (n, title, body) in enumerate(steps):
        y = H - 2.35 * inch - i * 1.25 * inch
        rounded_rect(c, 0.7 * inch, y, 12.0 * inch, 1.1 * inch, 8, fill=WHITE, stroke=INK, sw=1.5)
        set_fill(c, INK)
        c.circle(1.22 * inch, y + 0.55 * inch, 0.275 * inch, fill=1, stroke=0)
        set_fill(c, WHITE)
        c.setFont("Arial-Black", 16)
        c.drawCentredString(1.22 * inch, y + 0.47 * inch, n)
        set_fill(c, INK)
        c.setFont("Arial-Black", 18)
        c.drawString(1.75 * inch, y + 0.62 * inch, title)
        set_fill(c, MUTED)
        c.setFont("CourierNew", 13)
        c.drawString(1.75 * inch, y + 0.28 * inch, body)
    footer(c, 3)


def slide4(c):
    slide_bg(c, PAPER)
    set_fill(c, INK)
    c.setFont("Arial-Black", 32)
    c.drawString(0.7 * inch, H - 0.9 * inch, "Trust model")
    rows = [
        ("Signal", "Trusted for", True),
        ("Tweet / web (@bob, ticker mtee)", "UX only. Builds the Sepolia lock the operator submits.", False),
        ("Event to, token, amount", "Attested Sepolia TokensSentForBridging. Mint follows that.", True),
        ("Worker after lock", "Submits proofs. Cannot pick recipient or asset at mint time.", False),
        ("Replay", "processedQueries on the ASC.", False),
        ("Tx success", "receiptStatus == 1 in ManateeMint (precompile does not).", False),
        ("CTC", "Creditcoin gas. Not a sendable coin.", False),
    ]
    x, y_top = 0.7 * inch, H - 1.2 * inch
    col_w = [3.6 * inch, 8.4 * inch]
    row_h = 0.72 * inch
    table_h = row_h * len(rows)
    table_y = y_top - table_h
    # outer border
    set_stroke(c, INK)
    c.setLineWidth(1.25)
    c.rect(x, table_y, sum(col_w), table_h, fill=0, stroke=1)
    for i, (a, b, emph) in enumerate(rows):
        y = y_top - (i + 1) * row_h
        if i == 0:
            set_fill(c, INK)
            c.rect(x, y, sum(col_w), row_h, fill=1, stroke=0)
        else:
            set_fill(c, WHITE)
            c.rect(x, y, sum(col_w), row_h, fill=1, stroke=0)
        set_stroke(c, INK)
        c.setLineWidth(1.25)
        c.rect(x, y, col_w[0], row_h, fill=0, stroke=1)
        c.rect(x + col_w[0], y, col_w[1], row_h, fill=0, stroke=1)
        text_color = WHITE if i == 0 else INK
        muted_color = WHITE if i == 0 else MUTED
        set_fill(c, text_color)
        c.setFont("Arial-Black" if i == 0 or emph else "Arial", 13)
        c.drawString(x + 10, y + 0.28 * inch, a)
        set_fill(c, muted_color if i != 0 else WHITE)
        c.setFont("Arial-Black" if i == 0 else "Arial", 13)
        c.drawString(x + col_w[0] + 10, y + 0.28 * inch, b)
    footer(c, 4)


def slide5(c):
    slide_bg(c, PAPER)
    set_fill(c, INK)
    c.setFont("Arial-Black", 32)
    c.drawString(0.7 * inch, H - 0.9 * inch, "Live on testnet")
    set_fill(c, MUTED)
    c.setFont("Arial", 15)
    c.drawString(0.7 * inch, H - 1.3 * inch, "Open these. Search @ajenglish on the app for the dashboard.")
    proofs = [
        ("Tweet", "x.com/MauDucKG/status/2097873004579754267"),
        ("Sepolia lock", "sepolia.etherscan.io/tx/0xf74e4375…  TokensSentForBridging"),
        ("Creditcoin mint", "creditcoin-testnet.blockscout.com/tx/0xb6b3e7a5…"),
        ("Recipient", "@AJEnglish  →  0x01a256e8…7DA6  ·  2 mtee on CC3"),
        ("App", "manatee-production.up.railway.app"),
    ]
    for i, (k, v) in enumerate(proofs):
        y = H - 2.35 * inch - i * 0.95 * inch
        rounded_rect(c, 0.7 * inch, y, 12.0 * inch, 0.85 * inch, 8, fill=WHITE, stroke=INK, sw=1.5)
        set_fill(c, INK)
        c.setFont("Arial-Black", 14)
        c.drawString(0.95 * inch, y + 0.32 * inch, k)
        set_fill(c, BLUE)
        c.setFont("CourierNew", 13)
        c.drawString(3.4 * inch, y + 0.32 * inch, v)
    footer(c, 5)


def slide6(c):
    slide_bg(c, INK)
    draw_icon(c, 0.7 * inch, H - 2.8 * inch, 1.05 * inch)
    set_fill(c, YELLOW)
    c.setFont("Arial-Black", 44)
    c.drawString(2.0 * inch, H - 2.5 * inch, "manatee")
    set_fill(c, WHITE)
    c.setFont("Arial", 22)
    c.drawString(0.7 * inch, H - 3.7 * inch, "The social command never chooses recipient or asset.")
    c.drawString(0.7 * inch, H - 4.1 * inch, "Attestcoin does.")
    set_fill(c, YELLOW)
    c.setFont("CourierNew", 18)
    c.drawString(0.7 * inch, H - 5.05 * inch, "App     manatee-production.up.railway.app")
    c.drawString(0.7 * inch, H - 5.4 * inch, "Repo    github.com/ducnmm/manatee")
    c.drawString(0.7 * inch, H - 5.75 * inch, "Bot     x.com/ManateeWallet")


def main():
    c = canvas.Canvas(str(OUT), pagesize=(W, H))
    c.setTitle("manatee — social cross-chain send")
    c.setAuthor("Nguyen Mau Minh Duc")
    c.setSubject("BUIDL CTC 2026 Fall · DeFi · Attestcoin")
    for fn in (slide1, slide2, slide3, slide4, slide5, slide6):
        fn(c)
        c.showPage()
    c.save()
    print("wrote", OUT, "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
