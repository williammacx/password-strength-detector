const els = {
  pw: document.getElementById("pw"),
  toggle: document.getElementById("toggle"),
  bar: document.getElementById("bar"),
  label: document.getElementById("label"),
  scoreText: document.getElementById("scoreText"),
  entropyText: document.getElementById("entropyText"),
  checks: document.getElementById("checks"),
  tips: document.getElementById("tips"),
  gen: document.getElementById("gen"),
  copy: document.getElementById("copy"),
};

const COMMON = new Set([
  "password","123456","123456789","qwerty","12345","12345678","111111","123123",
  "abc123","letmein","monkey","dragon","iloveyou","admin","welcome","login",
  "princess","sunshine","football","baseball","starwars"
]);

const KEYBOARD_RUNS = [
  "qwertyuiop", "asdfghjkl", "zxcvbnm",
  "poiuytrewq", "lkjhgfdsa", "mnbvcxz"
];

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function hasSequentialRun(s) {
  const lower = s.toLowerCase();
  // detect "abcd", "1234", "wxyz", also reversed
  const alpha = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";

  for (let i = 0; i < lower.length - 3; i++) {
    const seg = lower.slice(i, i + 4);
    if (alpha.includes(seg) || alpha.split("").reverse().join("").includes(seg)) return true;
    if (digits.includes(seg) || digits.split("").reverse().join("").includes(seg)) return true;
  }

  // keyboard patterns
  for (const row of KEYBOARD_RUNS) {
    for (let i = 0; i < row.length - 3; i++) {
      const seg = row.slice(i, i + 4);
      if (lower.includes(seg)) return true;
    }
  }
  return false;
}

function repetitionPenalty(s){
  // penalize repeats like "aaaa", "ababab", "1111"
  const lower = s.toLowerCase();
  let penalty = 0;

  // same char runs (>=3)
  let run = 1;
  for (let i=1;i<lower.length;i++){
    if (lower[i] === lower[i-1]) { run++; if (run === 3) penalty += 8; else if (run > 3) penalty += 3; }
    else run = 1;
  }

  // repeated chunks (like "abcabc")
  for (let size=2; size<=4; size++){
    for (let i=0; i+2*size<=lower.length; i++){
      const a = lower.slice(i, i+size);
      const b = lower.slice(i+size, i+2*size);
      if (a === b) penalty += 8;
    }
  }
  return penalty;
}

function estimateEntropyBits(pw){
  // Very rough estimate: pool size based on char classes used.
  // Then log2(pool^len) = len * log2(pool)
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33; // approx printable symbols
  if (pool === 0) return 0;

  const len = pw.length;
  const bits = len * Math.log2(pool);

  // reduce entropy a bit for obvious patterns
  let reduction = 0;
  if (hasSequentialRun(pw)) reduction += 12;
  if (/(.)\1\1/.test(pw)) reduction += 10;
  if (COMMON.has(pw.toLowerCase())) reduction += 40;

  return Math.max(0, bits - reduction);
}

function scorePassword(pw){
  const len = pw.length;

  const checks = {
    min8: len >= 8,
    min12: len >= 12,
    min16: len >= 16,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /[0-9]/.test(pw),
    symbol: /[^a-zA-Z0-9]/.test(pw),
    spaces: /\s/.test(pw),
    common: COMMON.has(pw.toLowerCase()),
    sequential: hasSequentialRun(pw),
    repeated: repetitionPenalty(pw) > 0,
  };

  // Base points from length (up to 40)
  let score = 0;
  score += clamp((len - 6) * 4, 0, 40);

  // Variety points (up to 40)
  const variety = [checks.lower, checks.upper, checks.digit, checks.symbol].filter(Boolean).length;
  score += variety * 10;

  // Bonus for longer strong passwords
  if (checks.min12) score += 6;
  if (checks.min16) score += 6;

  // Penalties
  if (checks.common) score -= 35;
  if (checks.sequential) score -= 12;
  score -= repetitionPenalty(pw);
  if (checks.spaces) score -= 2; // slight penalty (spaces can be fine, but often accidental)
  if (/^(.)\1+$/.test(pw) && pw.length >= 4) score -= 30; // all same char

  score = clamp(Math.round(score), 0, 100);

  // label
  let label = "Very Weak";
  if (score >= 80) label = "Strong";
  else if (score >= 60) label = "Good";
  else if (score >= 40) label = "Fair";
  else if (score >= 20) label = "Weak";

  // meter color
  let color = "var(--bad)";
  if (score >= 80) color = "var(--good)";
  else if (score >= 40) color = "var(--warn)";

  // suggestions
  const tips = [];
  if (!checks.min8) tips.push("Use at least 8 characters (12+ is better).");
  else if (!checks.min12) tips.push("Consider 12+ characters for much better resistance.");
  if (variety < 3) tips.push("Add more character variety (upper/lower/digits/symbols).");
  if (checks.common) tips.push("Avoid common passwords (even with small tweaks).");
  if (checks.sequential) tips.push("Avoid sequences like abcd, 1234, or keyboard runs like qwerty.");
  if (checks.repeated) tips.push("Avoid repeated patterns like aaaa, abab, 1111.");
  if (len >= 14 && variety >= 3 && !checks.common && !checks.sequential && !checks.repeated) {
    tips.push("Looks solid. Consider using a password manager to generate/store unique passwords.");
  }

  const entropyBits = estimateEntropyBits(pw);

  return { score, label, color, checks, tips, entropyBits };
}

function render(pw){
  const { score, label, color, checks, tips, entropyBits } = scorePassword(pw);

  els.bar.style.width = `${score}%`;
  els.bar.style.background = color;

  els.label.textContent = label;
  els.scoreText.textContent = `Score: ${score}/100`;
  els.entropyText.textContent =
    pw.length ? `Estimated entropy: ~${Math.round(entropyBits)} bits` : "Estimated entropy: —";

  const items = [
    { key: "min8", text: "At least 8 characters" },
    { key: "min12", text: "12+ characters (recommended)" },
    { key: "min16", text: "16+ characters (excellent)" },
    { key: "lower", text: "Contains lowercase letters" },
    { key: "upper", text: "Contains uppercase letters" },
    { key: "digit", text: "Contains digits" },
    { key: "symbol", text: "Contains symbols" },
    { key: "common", text: "Not a common password" , invert: true},
    { key: "sequential", text: "No obvious sequences (abcd/1234/qwerty)", invert: true },
    { key: "repeated", text: "No repeated patterns (aaaa/abab/1111)", invert: true },
  ];

  els.checks.innerHTML = items.map(it => {
    const ok = it.invert ? !checks[it.key] : checks[it.key];
    const cls = ok ? "ok" : "no";
    const mark = ok ? "✓" : "✗";
    return `<li><span class="${cls}">${mark}</span> ${it.text}</li>`;
  }).join("");

  els.tips.innerHTML = (tips.length ? tips : ["Type a password to see suggestions."])
    .map(t => `<li>${t}</li>`).join("");
}

function randomFrom(chars){
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return chars[a[0] % chars.length];
}

function generateStrongPassword(len = 18){
  // avoids ambiguous chars by default; includes symbols
  const lowers = "abcdefghjkmnpqrstuvwxyz";
  const uppers = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*()-_=+[]{};:,.?";

  const all = lowers + uppers + digits + symbols;
  // guarantee at least one from each group
  let pw = [
    randomFrom(lowers),
    randomFrom(uppers),
    randomFrom(digits),
    randomFrom(symbols),
  ];
  while (pw.length < len) pw.push(randomFrom(all));

  // shuffle
  for (let i = pw.length - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const j = r[0] % (i + 1);
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join("");
}

// Events
els.pw.addEventListener("input", () => render(els.pw.value));

els.toggle.addEventListener("click", () => {
  const isHidden = els.pw.type === "password";
  els.pw.type = isHidden ? "text" : "password";
  els.toggle.textContent = isHidden ? "Hide" : "Show";
  els.toggle.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
});

els.gen.addEventListener("click", () => {
  const pw = generateStrongPassword(18);
  els.pw.value = pw;
  render(pw);
});

els.copy.addEventListener("click", async () => {
  const pw = els.pw.value;
  if (!pw) return;

  try {
    await navigator.clipboard.writeText(pw);
    els.copy.textContent = "Copied!";
    setTimeout(() => (els.copy.textContent = "Copy"), 900);
  } catch {
    // fallback
    els.pw.focus();
    els.pw.select();
    document.execCommand("copy");
    els.copy.textContent = "Copied!";
    setTimeout(() => (els.copy.textContent = "Copy"), 900);
  }
});

// initial
render("");
