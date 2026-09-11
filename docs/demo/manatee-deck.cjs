const pptxgen = require("pptxgenjs");
const path = require("path");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "manatee — social cross-chain send";
pres.author = "ducnmm";
pres.subject = "BUIDL CTC 2026 Fall · DeFi · Attestcoin";

const C = {
  paper: "F6F1E8",
  white: "FFFCF7",
  ink: "171717",
  muted: "5B6475",
  yellow: "F5C400",
  blue: "2F6BFF",
};

const ICON = path.join(__dirname, "../../web/public/apple-touch-icon.png");

function bg(slide, color) {
  slide.background = { color };
}

function footer(slide, n) {
  slide.addText("BUIDL CTC 2026 Fall  ·  DeFi  ·  Attestcoin", {
    x: 0.6, y: 7.05, w: 10, h: 0.28,
    fontFace: "Arial", fontSize: 11, color: C.muted, margin: 0,
  });
  slide.addText(String(n) + " / 6", {
    x: 11.8, y: 7.05, w: 0.9, h: 0.28,
    fontFace: "Arial", fontSize: 11, color: C.muted, align: "right", margin: 0,
  });
}

// 1 — title
{
  const s = pres.addSlide();
  bg(s, C.paper);
  s.addImage({ path: ICON, x: 0.7, y: 1.55, w: 1.15, h: 1.15 });
  s.addText("manatee", {
    x: 2.05, y: 1.55, w: 10, h: 1.15,
    fontFace: "Arial Black", fontSize: 54, color: C.ink, margin: 0, valign: "middle",
  });
  s.addText("Social cross-chain send. Tweet is UX. Attestcoin settles.", {
    x: 0.7, y: 3.0, w: 12, h: 0.55,
    fontFace: "Arial", fontSize: 22, color: C.ink, margin: 0,
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.7, y: 3.85, w: 5.4, h: 0.55,
    fill: { color: C.yellow }, line: { color: C.yellow, width: 0 }, rectRadius: 0.12,
  });
  s.addText("@ManateeWallet send 10 mtee @bob", {
    x: 0.85, y: 3.85, w: 5.1, h: 0.55,
    fontFace: "Courier New", fontSize: 14, color: C.ink, margin: 0, valign: "middle",
  });
  s.addText("Lock allowlisted ERC-20 on Ethereum Sepolia  →  Attestcoin verifies the event  →  mint on Creditcoin CC3.\nRecipient and token come from the attested log. CTC is gas only.", {
    x: 0.7, y: 4.7, w: 11.5, h: 1.1,
    fontFace: "Arial", fontSize: 16, color: C.muted, margin: 0,
  });
  s.addText("Live  manatee-production.up.railway.app     Repo  github.com/ducnmm/manatee", {
    x: 0.7, y: 6.15, w: 12, h: 0.35,
    fontFace: "Arial", fontSize: 14, color: C.blue, margin: 0,
  });
  footer(s, 1);
}

// 2 — problem
{
  const s = pres.addSlide();
  bg(s, C.paper);
  s.addText("The problem", {
    x: 0.7, y: 0.45, w: 12, h: 0.55,
    fontFace: "Arial Black", fontSize: 32, color: C.ink, margin: 0,
  });
  const cards = [
    { t: "Centralized bots", d: "A social bot that “sends” can pick a different recipient or ticker after you tweet. You are trusting the operator." },
    { t: "Naive bridges", d: "Many testnet bridges mint from an off-chain watcher. If the watcher lies, the destination chain still mints." },
    { t: "What we want", d: "The tweet builds the lock. After Attestcoin verifies Sepolia, Creditcoin mints only to the event’s to and token." },
  ];
  cards.forEach((c, i) => {
    const x = 0.7 + i * 4.15;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.35, w: 3.9, h: 4.85,
      fill: { color: C.white },
      line: { color: C.ink, width: 1.5 },
      rectRadius: 0.12,
    });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.28, y: 1.65, w: 0.42, h: 0.42,
      fill: { color: i === 2 ? C.yellow : C.ink },
      line: { color: i === 2 ? C.yellow : C.ink, width: 0 },
      rectRadius: 0.08,
    });
    s.addText(String(i + 1), {
      x: x + 0.28, y: 1.65, w: 0.42, h: 0.42,
      fontFace: "Arial Black", fontSize: 14, color: i === 2 ? C.ink : C.white,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(c.t, {
      x: x + 0.28, y: 2.25, w: 3.35, h: 0.7,
      fontFace: "Arial Black", fontSize: 18, color: C.ink, margin: 0,
    });
    s.addText(c.d, {
      x: x + 0.28, y: 3.05, w: 3.35, h: 2.6,
      fontFace: "Arial", fontSize: 15, color: C.muted, margin: 0,
    });
  });
  footer(s, 2);
}

// 3 — how it works
{
  const s = pres.addSlide();
  bg(s, C.paper);
  s.addText("How it works", {
    x: 0.7, y: 0.45, w: 12, h: 0.5,
    fontFace: "Arial Black", fontSize: 32, color: C.ink, margin: 0,
  });
  const steps = [
    { n: "1", t: "Tweet", d: "@ManateeWallet send 1 mtee @AJEnglish" },
    { n: "2", t: "Lock Sepolia", d: "ManateeLock.emit TokensSentForBridging(from, to, token, amount)" },
    { n: "3", t: "Attest ~8–10 min", d: "usc-sdk waits for height, then Merkle + continuity proofs" },
    { n: "4", t: "Mint CC3", d: "ManateeMint: receiptStatus, lock address, replay, mint event.to" },
  ];
  steps.forEach((st, i) => {
    const y = 1.2 + i * 1.25;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.7, y, w: 12.0, h: 1.1,
      fill: { color: C.white },
      line: { color: C.ink, width: 1.5 },
      rectRadius: 0.1,
    });
    s.addShape(pres.shapes.OVAL, {
      x: 0.95, y: y + 0.28, w: 0.55, h: 0.55,
      fill: { color: C.ink }, line: { color: C.ink, width: 0 },
    });
    s.addText(st.n, {
      x: 0.95, y: y + 0.28, w: 0.55, h: 0.55,
      fontFace: "Arial Black", fontSize: 16, color: C.white, align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.t, {
      x: 1.75, y: y + 0.14, w: 10.6, h: 0.4,
      fontFace: "Arial Black", fontSize: 18, color: C.ink, margin: 0,
    });
    s.addText(st.d, {
      x: 1.75, y: y + 0.54, w: 10.6, h: 0.4,
      fontFace: "Courier New", fontSize: 14, color: C.muted, margin: 0,
    });
  });
  footer(s, 3);
}

// 4 — trust model
{
  const s = pres.addSlide();
  bg(s, C.paper);
  s.addText("Trust model", {
    x: 0.7, y: 0.4, w: 12, h: 0.5,
    fontFace: "Arial Black", fontSize: 32, color: C.ink, margin: 0,
  });
  const rows = [
    ["Signal", "Trusted for"],
    ["Tweet / web (@bob, ticker mtee)", "UX only. Builds the Sepolia lock the operator submits."],
    ["Event to, token, amount", "Attested Sepolia TokensSentForBridging. Mint follows that."],
    ["Worker after lock", "Submits proofs. Cannot pick recipient or asset at mint time."],
    ["Replay", "processedQueries on the ASC."],
    ["Tx success", "receiptStatus == 1 in ManateeMint (precompile does not)."],
    ["CTC", "Creditcoin gas. Not a sendable coin."],
  ];
  const table = rows.map((r, i) => [
    {
      text: r[0],
      options: {
        fill: { color: i === 0 ? C.ink : C.white },
        color: i === 0 ? C.white : C.ink,
        bold: i === 0 || i === 2,
        fontFace: i === 0 ? "Arial Black" : "Arial",
        fontSize: i === 0 ? 13 : 13,
        valign: "middle",
        margin: 8,
      },
    },
    {
      text: r[1],
      options: {
        fill: { color: i === 0 ? C.ink : C.white },
        color: i === 0 ? C.white : C.muted,
        bold: i === 0,
        fontFace: "Arial",
        fontSize: 13,
        valign: "middle",
        margin: 8,
      },
    },
  ]);
  s.addTable(table, {
    x: 0.7, y: 1.1, w: 12.0, h: 5.5,
    colW: [3.6, 8.4],
    border: { pt: 1.25, color: C.ink },
    valign: "middle",
  });
  footer(s, 4);
}

// 5 — live proof
{
  const s = pres.addSlide();
  bg(s, C.paper);
  s.addText("Live on testnet", {
    x: 0.7, y: 0.4, w: 12, h: 0.5,
    fontFace: "Arial Black", fontSize: 32, color: C.ink, margin: 0,
  });
  s.addText("Open these. Search @ajenglish on the app for the dashboard.", {
    x: 0.7, y: 0.95, w: 12, h: 0.35,
    fontFace: "Arial", fontSize: 15, color: C.muted, margin: 0,
  });
  const proofs = [
    { k: "Tweet", v: "x.com/MauDucKG/status/2097873004579754267" },
    { k: "Sepolia lock", v: "sepolia.etherscan.io/tx/0xf74e4375…  TokensSentForBridging" },
    { k: "Creditcoin mint", v: "creditcoin-testnet.blockscout.com/tx/0xb6b3e7a5…" },
    { k: "Recipient", v: "@AJEnglish  →  0x01a256e8…7DA6  ·  2 mtee on CC3" },
    { k: "App", v: "manatee-production.up.railway.app" },
  ];
  proofs.forEach((p, i) => {
    const y = 1.45 + i * 0.95;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.7, y, w: 12.0, h: 0.85,
      fill: { color: C.white },
      line: { color: C.ink, width: 1.5 },
      rectRadius: 0.1,
    });
    s.addText(p.k, {
      x: 0.95, y: y + 0.08, w: 2.4, h: 0.7,
      fontFace: "Arial Black", fontSize: 14, color: C.ink, valign: "middle", margin: 0,
    });
    s.addText(p.v, {
      x: 3.4, y: y + 0.08, w: 9.0, h: 0.7,
      fontFace: "Courier New", fontSize: 13, color: C.blue, valign: "middle", margin: 0,
    });
  });
  footer(s, 5);
}

// 6 — ask
{
  const s = pres.addSlide();
  bg(s, C.ink);
  s.addImage({ path: ICON, x: 0.7, y: 1.7, w: 1.05, h: 1.05 });
  s.addText("manatee", {
    x: 2.0, y: 1.7, w: 10, h: 1.05,
    fontFace: "Arial Black", fontSize: 44, color: C.yellow, margin: 0, valign: "middle",
  });
  s.addText("The social command never chooses recipient or asset.\nAttestcoin does.", {
    x: 0.7, y: 3.1, w: 12, h: 1.2,
    fontFace: "Arial", fontSize: 22, color: C.white, margin: 0,
  });
  s.addText("App     manatee-production.up.railway.app\nRepo    github.com/ducnmm/manatee\nBot     x.com/ManateeWallet", {
    x: 0.7, y: 4.6, w: 12, h: 1.5,
    fontFace: "Courier New", fontSize: 18, color: C.yellow, margin: 0,
  });
}

pres.writeFile({ fileName: path.join(__dirname, "manatee-deck.pptx") })
  .then(() => console.log("wrote manatee-deck.pptx"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
