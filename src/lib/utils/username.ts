const GOLF_WORDS = [
  "birdie",
  "eagle",
  "fairway",
  "green",
  "wedge",
  "driver",
  "putter",
  "scratch",
  "bogey",
  "par",
];

export function baseFromEmail(email: string) {
  return email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16) || "golfer";
}

export function generateUsernameCandidate(email: string) {
  const base = baseFromEmail(email);
  const word = GOLF_WORDS[Math.floor(Math.random() * GOLF_WORDS.length)];
  const num = Math.floor(Math.random() * 1000); // 0–999
  return `${base}-${word}-${num}`;
}
