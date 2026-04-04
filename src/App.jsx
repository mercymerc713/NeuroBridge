import { useState, useEffect, useRef, useCallback } from "react";

// ─── Theme ───────────────────────────────────────────────────────────────────
const T = {
  bg: "#FFF8F0",
  surface: "#FFFFFF",
  text: "#2B2520",
  soft: "#9E9589",
  primary: "#FF6B3D",
  primaryGlow: "#FFF0EB",
  blue: "#4E8AE6",
  blueGlow: "#EBF2FF",
  purple: "#8B6CF6",
  purpleGlow: "#F3EFFF",
  green: "#3EBB6E",
  greenGlow: "#E6F9ED",
  yellow: "#F7B731",
  yellowGlow: "#FFF7E0",
  pink: "#E84E8A",
  pinkGlow: "#FFEBF3",
  border: "#F0EBE3",
  shadow: "0 4px 20px rgba(43,37,32,0.06)",
  radius: 22,
  font: "'Baloo 2', cursive",
  fontAlt: "'Atkinson Hyperlegible', sans-serif",
};

// ─── AAC Soundboard Data ─────────────────────────────────────────────────────
const aacCategories = [
  {
    id: "feelings", label: "Feelings", emoji: "💛", color: T.yellow, glow: T.yellowGlow,
    items: [
      { label: "Happy", emoji: "😊", speech: "I feel happy" },
      { label: "Sad", emoji: "😢", speech: "I feel sad" },
      { label: "Angry", emoji: "😠", speech: "I feel angry" },
      { label: "Scared", emoji: "😨", speech: "I feel scared" },
      { label: "Tired", emoji: "😴", speech: "I feel tired" },
      { label: "Excited", emoji: "🤩", speech: "I feel excited" },
      { label: "Calm", emoji: "😌", speech: "I feel calm" },
      { label: "Sick", emoji: "🤒", speech: "I don't feel well" },
      { label: "Confused", emoji: "😕", speech: "I feel confused" },
      { label: "Loved", emoji: "🥰", speech: "I feel loved" },
      { label: "Frustrated", emoji: "😤", speech: "I feel frustrated" },
      { label: "Proud", emoji: "😊", speech: "I feel proud of myself" },
    ],
  },
  {
    id: "needs", label: "I Need", emoji: "🙋", color: T.primary, glow: T.primaryGlow,
    items: [
      { label: "Help", emoji: "🤝", speech: "I need help please" },
      { label: "Water", emoji: "💧", speech: "I want water please" },
      { label: "Food", emoji: "🍎", speech: "I am hungry" },
      { label: "Bathroom", emoji: "🚻", speech: "I need to use the bathroom" },
      { label: "Break", emoji: "⏸️", speech: "I need a break please" },
      { label: "Hug", emoji: "🤗", speech: "I want a hug" },
      { label: "Space", emoji: "🧘", speech: "I need some space please" },
      { label: "Quiet", emoji: "🤫", speech: "It's too loud. I need quiet" },
      { label: "Medicine", emoji: "💊", speech: "I need my medicine" },
      { label: "Sleep", emoji: "😴", speech: "I want to sleep" },
      { label: "Outside", emoji: "🌳", speech: "I want to go outside" },
      { label: "Home", emoji: "🏠", speech: "I want to go home" },
    ],
  },
  {
    id: "responses", label: "Answers", emoji: "💬", color: T.blue, glow: T.blueGlow,
    items: [
      { label: "Yes", emoji: "✅", speech: "Yes" },
      { label: "No", emoji: "❌", speech: "No" },
      { label: "Maybe", emoji: "🤔", speech: "Maybe" },
      { label: "Please", emoji: "🙏", speech: "Please" },
      { label: "Thank You", emoji: "💖", speech: "Thank you" },
      { label: "Sorry", emoji: "😔", speech: "I'm sorry" },
      { label: "Wait", emoji: "✋", speech: "Please wait" },
      { label: "Again", emoji: "🔄", speech: "Again please" },
      { label: "Stop", emoji: "🛑", speech: "Stop please" },
      { label: "More", emoji: "➕", speech: "I want more please" },
      { label: "All Done", emoji: "✨", speech: "I'm all done" },
      { label: "I Don't Know", emoji: "🤷", speech: "I don't know" },
    ],
  },
  {
    id: "social", label: "Social", emoji: "👋", color: T.green, glow: T.greenGlow,
    items: [
      { label: "Hello", emoji: "👋", speech: "Hello! How are you?" },
      { label: "Goodbye", emoji: "👋", speech: "Goodbye! See you later" },
      { label: "My Name", emoji: "🏷️", speech: "My name is" },
      { label: "Friend", emoji: "🤝", speech: "Will you be my friend?" },
      { label: "Play", emoji: "🎮", speech: "Do you want to play?" },
      { label: "Share", emoji: "🤲", speech: "Do you want to share?" },
      { label: "Good Job", emoji: "⭐", speech: "Good job!" },
      { label: "I Love You", emoji: "❤️", speech: "I love you" },
      { label: "Look", emoji: "👀", speech: "Look at this!" },
      { label: "Funny", emoji: "😂", speech: "That's funny!" },
      { label: "Come Here", emoji: "🫶", speech: "Come here please" },
      { label: "My Turn", emoji: "☝️", speech: "It's my turn" },
    ],
  },
  {
    id: "places", label: "Places", emoji: "📍", color: T.purple, glow: T.purpleGlow,
    items: [
      { label: "School", emoji: "🏫", speech: "I want to go to school" },
      { label: "Park", emoji: "🌲", speech: "I want to go to the park" },
      { label: "Store", emoji: "🛒", speech: "I want to go to the store" },
      { label: "Doctor", emoji: "🏥", speech: "I need to see the doctor" },
      { label: "Car", emoji: "🚗", speech: "I want to go in the car" },
      { label: "Bedroom", emoji: "🛏️", speech: "I want to go to my room" },
      { label: "Kitchen", emoji: "🍳", speech: "I want to go to the kitchen" },
      { label: "Library", emoji: "📚", speech: "I want to go to the library" },
    ],
  },
];

// ─── Learning Games Data ─────────────────────────────────────────────────────
const wordGames = [
  { image: "🐱", word: "CAT", choices: ["CAT", "BAT", "HAT", "RAT"], hint: "A furry pet that purrs" },
  { image: "☀️", word: "SUN", choices: ["BUN", "SUN", "FUN", "RUN"], hint: "Bright in the sky" },
  { image: "🐕", word: "DOG", choices: ["LOG", "FOG", "DOG", "HOG"], hint: "A pet that barks" },
  { image: "🐟", word: "FISH", choices: ["DISH", "FISH", "WISH", "SWISH"], hint: "Swims in water" },
  { image: "🌳", word: "TREE", choices: ["FREE", "THREE", "TREE", "SEE"], hint: "Tall with leaves" },
  { image: "🌙", word: "MOON", choices: ["MOON", "NOON", "SOON", "SPOON"], hint: "In the night sky" },
  { image: "⭐", word: "STAR", choices: ["CAR", "STAR", "FAR", "BAR"], hint: "Twinkles at night" },
  { image: "🏠", word: "HOME", choices: ["DOME", "HOME", "SOME", "COME"], hint: "Where you live" },
  { image: "🎵", word: "SONG", choices: ["LONG", "SONG", "GONG", "BONG"], hint: "Music you sing" },
  { image: "🦋", word: "FLY", choices: ["FLY", "TRY", "CRY", "SKY"], hint: "Wings help you do this" },
];

const colorMatchGame = [
  { color: "#FF4444", name: "RED", emoji: "🔴" },
  { color: "#4488FF", name: "BLUE", emoji: "🔵" },
  { color: "#44BB44", name: "GREEN", emoji: "🟢" },
  { color: "#FFBB33", name: "YELLOW", emoji: "🟡" },
  { color: "#BB44FF", name: "PURPLE", emoji: "🟣" },
  { color: "#FF8844", name: "ORANGE", emoji: "🟠" },
];

const patternData = [
  { pattern: ["🔴", "🔵", "🔴", "🔵", "?"], answer: "🔴", choices: ["🔴", "🟢", "🔵"] },
  { pattern: ["⭐", "⭐", "🌙", "⭐", "⭐", "?"], answer: "🌙", choices: ["⭐", "🌙", "☀️"] },
  { pattern: ["🐱", "🐕", "🐱", "🐕", "?"], answer: "🐱", choices: ["🐟", "🐱", "🐕"] },
  { pattern: ["1", "2", "3", "4", "?"], answer: "5", choices: ["5", "6", "3"] },
  { pattern: ["🍎", "🍌", "🍎", "🍌", "🍎", "?"], answer: "🍌", choices: ["🍎", "🍌", "🍇"] },
  { pattern: ["△", "○", "□", "△", "○", "?"], answer: "□", choices: ["△", "○", "□"] },
];

const mathProblems = [
  { q: "1 + 1", a: 2, choices: [1, 2, 3] },
  { q: "2 + 3", a: 5, choices: [4, 5, 6] },
  { q: "5 - 2", a: 3, choices: [2, 3, 4] },
  { q: "3 + 4", a: 7, choices: [6, 7, 8] },
  { q: "6 - 1", a: 5, choices: [4, 5, 6] },
  { q: "4 + 4", a: 8, choices: [7, 8, 9] },
  { q: "10 - 3", a: 7, choices: [6, 7, 8] },
  { q: "2 + 6", a: 8, choices: [7, 8, 9] },
];

// ─── Speech ──────────────────────────────────────────────────────────────────
function speak(text, rate = 0.9) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = 1.1;
    window.speechSynthesis.speak(u);
  }
}

// ─── Shared UI ───────────────────────────────────────────────────────────────
function Btn({ children, color = T.primary, style, onClick, size = "md", disabled }) {
  const sizes = { sm: { padding: "8px 16px", fontSize: 14 }, md: { padding: "14px 28px", fontSize: 16 }, lg: { padding: "18px 36px", fontSize: 18 } };
  return (
    <button disabled={disabled} onClick={onClick} style={{
      ...sizes[size], borderRadius: 50, border: "none",
      background: disabled ? T.border : color, color: "#fff",
      fontFamily: T.font, fontWeight: 700, cursor: disabled ? "default" : "pointer",
      boxShadow: disabled ? "none" : `0 4px 16px ${color}40`,
      transition: "all 0.15s ease", opacity: disabled ? 0.5 : 1, ...style,
    }}>{children}</button>
  );
}

function Card({ children, style, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: T.surface, borderRadius: T.radius, padding: 20,
      boxShadow: T.shadow, border: `1.5px solid ${T.border}`,
      cursor: onClick ? "pointer" : "default", transition: "transform 0.12s ease", ...style,
    }}
      onPointerDown={e => onClick && (e.currentTarget.style.transform = "scale(0.97)")}
      onPointerUp={e => onClick && (e.currentTarget.style.transform = "scale(1)")}
      onPointerLeave={e => onClick && (e.currentTarget.style.transform = "scale(1)")}
    >{children}</div>
  );
}

function Header({ title, onBack, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, minHeight: 40 }}>
      {onBack && (
        <button onClick={onBack} style={{
          width: 40, height: 40, borderRadius: 14, border: `1.5px solid ${T.border}`,
          background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="2.5" strokeLinecap="round"><path d="M15 19l-7-7 7-7"/></svg>
        </button>
      )}
      <h1 style={{ fontFamily: T.font, fontSize: 24, fontWeight: 800, color: T.text, margin: 0, flex: 1 }}>{title}</h1>
      {right}
    </div>
  );
}

function ProgressBar({ value, max, color = T.primary, h = 10 }) {
  return (
    <div style={{ width: "100%", height: h, background: T.border, borderRadius: h, overflow: "hidden" }}>
      <div style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, height: "100%", background: color, borderRadius: h, transition: "width 0.4s ease" }} />
    </div>
  );
}

function Confetti({ active }) {
  if (!active) return null;
  const colors = [T.primary, T.blue, T.purple, T.green, T.yellow, T.pink];
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 999, overflow: "hidden" }}>
      {Array.from({ length: 40 }).map((_, i) => {
        const rot = 360 + Math.random() * 360;
        return (
          <div key={i} style={{
            position: "absolute", left: `${Math.random() * 100}%`, top: -20,
            width: Math.random() * 10 + 6, height: Math.random() * 10 + 6,
            background: colors[Math.floor(Math.random() * colors.length)],
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            animation: `confFall ${1.5 + Math.random() * 2}s ease-in forwards`,
            animationDelay: `${Math.random() * 0.5}s`,
          }} />
        );
      })}
      <style>{`@keyframes confFall { 0% { transform: translateY(0) rotate(0deg); opacity:1; } 100% { transform: translateY(100vh) rotate(720deg); opacity:0; } }`}</style>
    </div>
  );
}

// ─── HOME ────────────────────────────────────────────────────────────────────
function HomeScreen({ setScreen }) {
  const tips = ["Every step forward counts! 🌟", "Your brain is amazing! 🧠", "Take breaks when you need them! 💛", "You're doing great! ⭐"];
  const [tip] = useState(tips[Math.floor(Math.random() * tips.length)]);

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <div style={{
        background: "linear-gradient(135deg, #FF6B3D 0%, #FF8F6B 50%, #FFB088 100%)",
        borderRadius: 28, padding: "28px 24px", marginBottom: 24, color: "#fff", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -20, right: -20, fontSize: 100, opacity: 0.15 }}>🧠</div>
        <h1 style={{ fontFamily: T.font, fontSize: 30, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>NeuroBridge</h1>
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, margin: "8px 0 0", opacity: 0.9, lineHeight: 1.5 }}>
          Learning tools built for the way <em>your</em> brain works.
        </p>
        <p style={{ fontFamily: T.font, fontSize: 14, margin: "14px 0 0", background: "rgba(255,255,255,0.2)", display: "inline-block", padding: "6px 14px", borderRadius: 50 }}>
          {tip}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {[
          { emoji: "💬", title: "Soundboard", desc: "Communicate with picture cards & voice", color: T.blue, glow: T.blueGlow, screen: "soundboard" },
          { emoji: "🎮", title: "Learning Games", desc: "Words, colors, patterns, & math", color: T.purple, glow: T.purpleGlow, screen: "games" },
          { emoji: "🎯", title: "Focus Timer", desc: "Stay on track with gentle reminders", color: T.green, glow: T.greenGlow, screen: "focus" },
          { emoji: "🫧", title: "Calm Corner", desc: "Breathing, sounds, & sensory tools", color: T.pink, glow: T.pinkGlow, screen: "calm" },
          { emoji: "✅", title: "My Routines", desc: "Visual daily schedules & checklists", color: T.yellow, glow: T.yellowGlow, screen: "habits" },
        ].map(item => (
          <Card key={item.screen} onClick={() => setScreen(item.screen)}
            style={{ display: "flex", alignItems: "center", gap: 16, padding: 18, background: item.glow, border: `1.5px solid ${item.color}20` }}>
            <div style={{
              width: 56, height: 56, borderRadius: 18, background: `${item.color}18`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0,
            }}>{item.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text }}>{item.title}</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft, marginTop: 2, lineHeight: 1.4 }}>{item.desc}</div>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.soft} strokeWidth="2" strokeLinecap="round"><path d="M9 5l7 7-7 7"/></svg>
          </Card>
        ))}
      </div>

      <div style={{ marginTop: 24, padding: 18, borderRadius: 18, border: `1.5px dashed ${T.border}`, textAlign: "center" }}>
        <span style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft, lineHeight: 1.6 }}>
          🧩 Designed for dyslexia, ADHD, autism & all neurodivergent minds
        </span>
      </div>
    </div>
  );
}

// ─── SOUNDBOARD ──────────────────────────────────────────────────────────────
function SoundboardScreen({ setScreen }) {
  const [cat, setCat] = useState(null);
  const [sentence, setSentence] = useState([]);
  const [lastSpoken, setLastSpoken] = useState(null);

  function tapItem(item) {
    speak(item.speech);
    setLastSpoken(item.label);
    setSentence(prev => [...prev, item]);
    setTimeout(() => setLastSpoken(null), 800);
  }

  function speakSentence() {
    if (sentence.length > 0) speak(sentence.map(s => s.speech).join(". "));
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="💬 Soundboard" onBack={() => setScreen("home")} />

      <div style={{
        background: T.surface, borderRadius: 18, padding: 14, marginBottom: 16,
        border: `2px solid ${T.blue}30`, minHeight: 64,
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", boxShadow: T.shadow,
      }}>
        {sentence.length === 0 ? (
          <span style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft }}>Tap cards to build a sentence...</span>
        ) : sentence.map((s, i) => (
          <span key={i} style={{
            background: T.blueGlow, padding: "6px 12px", borderRadius: 12,
            fontFamily: T.font, fontSize: 14, fontWeight: 600, color: T.blue,
          }}>{s.emoji} {s.label}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <Btn color={T.blue} onClick={speakSentence} style={{ flex: 1 }} disabled={sentence.length === 0}>🔊 Speak All</Btn>
        <Btn color={T.soft} onClick={() => setSentence([])} style={{}} disabled={sentence.length === 0}>Clear</Btn>
      </div>

      {cat === null ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {aacCategories.map(c => (
            <Card key={c.id} onClick={() => setCat(c.id)}
              style={{ textAlign: "center", padding: 24, background: c.glow, border: `1.5px solid ${c.color}25` }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>{c.emoji}</div>
              <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: c.color }}>{c.label}</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft, marginTop: 4 }}>{c.items.length} cards</div>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <button onClick={() => setCat(null)} style={{
            fontFamily: T.font, fontSize: 14, fontWeight: 600, color: T.soft,
            background: "none", border: "none", cursor: "pointer", marginBottom: 16,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 19l-7-7 7-7"/></svg>
            All Categories
          </button>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {aacCategories.find(c => c.id === cat).items.map((item, i) => {
              const catData = aacCategories.find(c => c.id === cat);
              const isActive = lastSpoken === item.label;
              return (
                <button key={i} onClick={() => tapItem(item)}
                  style={{
                    background: isActive ? catData.color : T.surface,
                    border: `2px solid ${isActive ? catData.color : catData.color + "30"}`,
                    borderRadius: 18, padding: "16px 8px", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    transition: "all 0.15s ease",
                    transform: isActive ? "scale(1.05)" : "scale(1)",
                    boxShadow: isActive ? `0 4px 20px ${catData.color}40` : "none",
                  }}>
                  <span style={{ fontSize: 32 }}>{item.emoji}</span>
                  <span style={{
                    fontFamily: T.font, fontSize: 13, fontWeight: 700,
                    color: isActive ? "#fff" : T.text, lineHeight: 1.2, textAlign: "center",
                  }}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── GAMES HUB ───────────────────────────────────────────────────────────────
function GamesScreen({ setScreen }) {
  const games = [
    { id: "words", emoji: "🔤", title: "Word Match", desc: "Match pictures to words", color: T.primary, glow: T.primaryGlow },
    { id: "colors", emoji: "🎨", title: "Color Match", desc: "Learn your colors", color: T.blue, glow: T.blueGlow },
    { id: "patterns", emoji: "🔷", title: "Pattern Finder", desc: "What comes next?", color: T.purple, glow: T.purpleGlow },
    { id: "math", emoji: "🔢", title: "Number Fun", desc: "Simple adding & subtracting", color: T.green, glow: T.greenGlow },
  ];
  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🎮 Learning Games" onBack={() => setScreen("home")} />
      <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, margin: "0 0 20px", lineHeight: 1.6 }}>Pick a game! Take your time — no rush.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {games.map(g => (
          <Card key={g.id} onClick={() => setScreen(`game_${g.id}`)}
            style={{ display: "flex", alignItems: "center", gap: 16, padding: 20, background: g.glow, border: `1.5px solid ${g.color}20` }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20, background: `${g.color}15`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, flexShrink: 0,
            }}>{g.emoji}</div>
            <div>
              <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text }}>{g.title}</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, marginTop: 4 }}>{g.desc}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── WORD GAME ───────────────────────────────────────────────────────────────
function WordGameScreen({ setScreen }) {
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const game = wordGames[idx];

  function pick(choice) {
    if (feedback) return;
    if (choice === game.word) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      speak("Great job!");
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => { setFeedback(""); setShowHint(false); setIdx(i => (i + 1) % wordGames.length); }, 1800);
    } else {
      setFeedback("wrong"); speak("Try again!");
      setTimeout(() => setFeedback(""), 1000);
    }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🔤 Word Match" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <Card style={{ textAlign: "center", padding: 32, marginBottom: 20 }}>
        <div style={{ fontSize: 80, marginBottom: 12 }}>{game.image}</div>
        <p style={{ fontFamily: T.fontAlt, fontSize: 16, color: T.soft, margin: 0 }}>What word matches this picture?</p>
        {showHint && <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.blue, margin: "10px 0 0", fontStyle: "italic" }}>💡 {game.hint}</p>}
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {game.choices.map(c => {
          let bg = T.surface, border = T.border, col = T.text;
          if (feedback === "correct" && c === game.word) { bg = T.greenGlow; border = T.green; col = T.green; }
          return (
            <button key={c} onClick={() => pick(c)} style={{
              padding: 20, borderRadius: 18, border: `2.5px solid ${border}`, background: bg, cursor: "pointer",
              fontFamily: T.font, fontSize: 22, fontWeight: 800, color: col, letterSpacing: 3, transition: "all 0.15s ease",
            }}>{c}</button>
          );
        })}
      </div>
      {!showHint && !feedback && (
        <button onClick={() => setShowHint(true)} style={{
          width: "100%", padding: 12, background: "none", border: `1.5px dashed ${T.border}`,
          borderRadius: 14, fontFamily: T.font, fontSize: 14, color: T.soft, cursor: "pointer",
        }}>💡 Show Hint</button>
      )}
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Awesome!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Hmm, try again! 💪</div>}
    </div>
  );
}

// ─── COLOR GAME ──────────────────────────────────────────────────────────────
function ColorGameScreen({ setScreen }) {
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [choices, setChoices] = useState([]);
  const [target, setTarget] = useState(null);

  const newRound = useCallback(() => {
    const t = colorMatchGame[Math.floor(Math.random() * colorMatchGame.length)];
    const others = colorMatchGame.filter(c => c.name !== t.name).sort(() => Math.random() - 0.5).slice(0, 2);
    setTarget(t); setChoices([t, ...others].sort(() => Math.random() - 0.5)); setFeedback("");
  }, []);

  useEffect(() => { newRound(); }, [newRound]);

  function pick(name) {
    if (feedback) return;
    if (name === target.name) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      speak(`Yes! That's ${target.name.toLowerCase()}!`);
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(newRound, 1500);
    } else { setFeedback("wrong"); speak("Not quite!"); setTimeout(() => setFeedback(""), 800); }
  }

  if (!target) return null;
  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🎨 Color Match" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <Card style={{ textAlign: "center", padding: 32, marginBottom: 24 }}>
        <div style={{ width: 120, height: 120, borderRadius: 30, background: target.color, margin: "0 auto 16px", boxShadow: `0 8px 30px ${target.color}40` }} />
        <p style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, margin: 0 }}>What color is this?</p>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {choices.map(c => (
          <button key={c.name} onClick={() => pick(c.name)} style={{
            padding: 18, borderRadius: 18, border: `2.5px solid ${T.border}`,
            background: feedback === "correct" && c.name === target.name ? T.greenGlow : T.surface,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
            fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, transition: "all 0.15s ease",
          }}><span style={{ fontSize: 28 }}>{c.emoji}</span> {c.name}</button>
        ))}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Perfect!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Almost! Try again! 💪</div>}
    </div>
  );
}

// ─── PATTERN GAME ────────────────────────────────────────────────────────────
function PatternGameScreen({ setScreen }) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const p = patternData[idx];

  function pick(val) {
    if (feedback) return;
    if (val === p.answer) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      speak("You found the pattern!");
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => { setFeedback(""); setIdx(i => (i + 1) % patternData.length); }, 1500);
    } else { setFeedback("wrong"); speak("Look again"); setTimeout(() => setFeedback(""), 800); }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🔷 Pattern Finder" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <Card style={{ textAlign: "center", padding: 28, marginBottom: 24 }}>
        <p style={{ fontFamily: T.font, fontSize: 16, color: T.soft, margin: "0 0 16px" }}>What comes next?</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          {p.pattern.map((item, i) => (
            <div key={i} style={{
              width: 50, height: 50, borderRadius: 14,
              background: item === "?" ? `${T.purple}15` : T.surface,
              border: item === "?" ? `2.5px dashed ${T.purple}` : `2px solid ${T.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: T.font, fontSize: item === "?" ? 24 : 20, fontWeight: 700, color: item === "?" ? T.purple : T.text,
            }}>{item}</div>
          ))}
        </div>
      </Card>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        {p.choices.map(c => (
          <button key={c} onClick={() => pick(c)} style={{
            width: 80, height: 80, borderRadius: 20, border: `2.5px solid ${T.border}`,
            background: feedback === "correct" && c === p.answer ? T.greenGlow : T.surface,
            cursor: "pointer", fontFamily: T.font, fontSize: 28, fontWeight: 700, transition: "all 0.15s ease",
          }}>{c}</button>
        ))}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 You got it!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Look closely! 👀</div>}
    </div>
  );
}

// ─── MATH GAME ───────────────────────────────────────────────────────────────
function MathGameScreen({ setScreen }) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const prob = mathProblems[idx];

  function pick(val) {
    if (feedback) return;
    if (val === prob.a) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      speak(`Yes! ${prob.q} equals ${prob.a}`);
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => { setFeedback(""); setIdx(i => (i + 1) % mathProblems.length); }, 1500);
    } else { setFeedback("wrong"); speak("Not quite"); setTimeout(() => setFeedback(""), 800); }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🔢 Number Fun" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <Card style={{ textAlign: "center", padding: 36, marginBottom: 24 }}>
        <div style={{ fontFamily: T.font, fontSize: 56, fontWeight: 800, color: T.text, letterSpacing: 4 }}>{prob.q}</div>
        <div style={{ fontFamily: T.font, fontSize: 20, color: T.soft, marginTop: 8 }}>= ?</div>
      </Card>
      <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
        {prob.choices.map(c => (
          <button key={c} onClick={() => pick(c)} style={{
            width: 88, height: 88, borderRadius: 22, border: `3px solid ${T.border}`,
            background: feedback === "correct" && c === prob.a ? T.greenGlow : T.surface,
            cursor: "pointer", fontFamily: T.font, fontSize: 32, fontWeight: 800, color: T.text,
            boxShadow: T.shadow, transition: "all 0.15s ease",
          }}>{c}</button>
        ))}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Correct!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Try again! 💪</div>}
    </div>
  );
}

// ─── FOCUS TIMER ─────────────────────────────────────────────────────────────
function FocusScreen({ setScreen }) {
  const [minutes, setMinutes] = useState(15);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState("focus");
  const intervalRef = useRef(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => {
          if (s === 0) {
            setMinutes(m => {
              if (m === 0) {
                clearInterval(intervalRef.current); setRunning(false);
                speak(mode === "focus" ? "Time for a break!" : "Ready to focus again!");
                setMode(prev => prev === "focus" ? "break" : "focus");
                setMinutes(mode === "focus" ? 5 : 15);
                return 0;
              }
              return m - 1;
            });
            return 59;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, mode]);

  const presets = [5, 10, 15, 25];

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🎯 Focus Timer" onBack={() => { setRunning(false); setScreen("home"); }} />
      <div style={{
        textAlign: "center", padding: "40px 20px", background: mode === "focus" ? T.blueGlow : T.greenGlow,
        borderRadius: 28, marginBottom: 24, border: `2px solid ${mode === "focus" ? T.blue : T.green}20`,
      }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 600, color: mode === "focus" ? T.blue : T.green, marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>
          {mode === "focus" ? "🎯 Focus Time" : "🌿 Break Time"}
        </div>
        <div style={{ fontFamily: T.font, fontSize: 72, fontWeight: 800, color: T.text, lineHeight: 1 }}>
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 28 }}>
          <Btn color={running ? T.primary : T.green} size="lg" onClick={() => setRunning(!running)}>
            {running ? "⏸ Pause" : "▶ Start"}
          </Btn>
          {!running && <Btn color={T.soft} size="lg" onClick={() => { setMinutes(mode === "focus" ? 15 : 5); setSeconds(0); }}>↺ Reset</Btn>}
        </div>
      </div>
      {!running && mode === "focus" && (
        <>
          <p style={{ fontFamily: T.font, fontSize: 15, color: T.soft, margin: "0 0 12px" }}>Quick set:</p>
          <div style={{ display: "flex", gap: 10 }}>
            {presets.map(p => (
              <button key={p} onClick={() => { setMinutes(p); setSeconds(0); }} style={{
                flex: 1, padding: "14px 0", borderRadius: 16,
                border: minutes === p ? `2.5px solid ${T.blue}` : `1.5px solid ${T.border}`,
                background: minutes === p ? T.blueGlow : T.surface,
                fontFamily: T.font, fontSize: 16, fontWeight: 700,
                color: minutes === p ? T.blue : T.text, cursor: "pointer",
              }}>{p}m</button>
            ))}
          </div>
        </>
      )}
      <Card style={{ marginTop: 24, background: T.yellowGlow, border: `1.5px solid ${T.yellow}20` }}>
        <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6 }}>💡 Focus Tips</div>
        <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, lineHeight: 2 }}>
          Remove distractions · Have water nearby · Take breaks when the timer says · Start small and build up
        </div>
      </Card>
    </div>
  );
}

// ─── CALM CORNER ─────────────────────────────────────────────────────────────
function CalmScreen({ setScreen }) {
  const [breathing, setBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState("in");
  const [breathCount, setBreathCount] = useState(4);
  const breathRef = useRef(null);

  useEffect(() => {
    if (breathing) {
      let phase = "in", count = 4;
      breathRef.current = setInterval(() => {
        count--;
        if (count <= 0) {
          if (phase === "in") { phase = "hold"; } else if (phase === "hold") { phase = "out"; } else { phase = "in"; }
          count = 4;
        }
        setBreathPhase(phase); setBreathCount(count);
      }, 1000);
    }
    return () => clearInterval(breathRef.current);
  }, [breathing]);

  const breathInfo = { in: { label: "Breathe In...", color: T.blue, scale: 1.3 }, hold: { label: "Hold...", color: T.purple, scale: 1.3 }, out: { label: "Breathe Out...", color: T.green, scale: 0.9 } };
  const bi = breathInfo[breathPhase];

  const sounds = [
    { emoji: "🌊", label: "Ocean" }, { emoji: "🌧️", label: "Rain" }, { emoji: "🐦", label: "Birds" },
    { emoji: "🎵", label: "Music" }, { emoji: "🦗", label: "Night" }, { emoji: "💨", label: "Wind" },
  ];

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🫧 Calm Corner" onBack={() => { setBreathing(false); setScreen("home"); }} />

      <Card style={{ textAlign: "center", padding: 32, marginBottom: 20, background: breathing ? `${bi.color}08` : T.surface }}>
        <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 20 }}>Breathing Exercise</div>
        <div style={{
          width: 140, height: 140, borderRadius: "50%", margin: "0 auto 20px",
          background: breathing ? `${bi.color}20` : `${T.blue}10`,
          border: `3px solid ${breathing ? bi.color : T.blue}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 1s ease", transform: breathing ? `scale(${bi.scale})` : "scale(1)",
        }}>
          <span style={{ fontSize: breathing ? 40 : 48 }}>{breathing ? breathCount : "🫁"}</span>
        </div>
        {breathing && <p style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: bi.color, margin: "0 0 16px" }}>{bi.label}</p>}
        <Btn color={breathing ? T.primary : T.blue} onClick={() => setBreathing(!breathing)}>
          {breathing ? "Stop" : "Start Breathing"}
        </Btn>
      </Card>

      <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 14 }}>Ambient Sounds</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        {sounds.map(s => (
          <button key={s.label} onClick={() => speak(s.label)} style={{
            padding: "18px 8px", borderRadius: 18, border: `1.5px solid ${T.border}`,
            background: T.surface, cursor: "pointer", textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 4 }}>{s.emoji}</div>
            <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.text }}>{s.label}</div>
          </button>
        ))}
      </div>

      <Card style={{ background: T.purpleGlow, border: `1.5px solid ${T.purple}20` }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.purple, marginBottom: 10 }}>🧘 5-4-3-2-1 Grounding</div>
        <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.text, lineHeight: 2.2 }}>
          <strong>5</strong> things you can <strong>see</strong> 👀<br />
          <strong>4</strong> things you can <strong>touch</strong> ✋<br />
          <strong>3</strong> things you can <strong>hear</strong> 👂<br />
          <strong>2</strong> things you can <strong>smell</strong> 👃<br />
          <strong>1</strong> thing you can <strong>taste</strong> 👅
        </div>
      </Card>
    </div>
  );
}

// ─── HABITS ──────────────────────────────────────────────────────────────────
function HabitsScreen({ setScreen }) {
  const [habits, setHabits] = useState([
    { id: 1, emoji: "🌅", label: "Wake up routine", done: false },
    { id: 2, emoji: "🪥", label: "Brush teeth", done: false },
    { id: 3, emoji: "🍎", label: "Eat breakfast", done: false },
    { id: 4, emoji: "📚", label: "Learning time", done: false },
    { id: 5, emoji: "🏃", label: "Movement break", done: false },
    { id: 6, emoji: "🍽️", label: "Eat lunch", done: false },
    { id: 7, emoji: "🎨", label: "Creative time", done: false },
    { id: 8, emoji: "🛁", label: "Bath time", done: false },
    { id: 9, emoji: "📖", label: "Story time", done: false },
    { id: 10, emoji: "🌙", label: "Bedtime", done: false },
  ]);

  const done = habits.filter(h => h.done).length;

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="✅ My Routines" onBack={() => setScreen("home")} />
      <div style={{
        background: "linear-gradient(135deg, #F7B731 0%, #FFCF5C 100%)",
        borderRadius: 22, padding: 20, marginBottom: 24, color: "#fff",
      }}>
        <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700 }}>Today's Progress</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
          <div style={{ flex: 1 }}><ProgressBar value={done} max={habits.length} color="#fff" h={12} /></div>
          <span style={{ fontFamily: T.font, fontSize: 18, fontWeight: 800 }}>{done}/{habits.length}</span>
        </div>
        {done === habits.length && <div style={{ fontFamily: T.font, fontSize: 16, marginTop: 10 }}>🎉 All done! Amazing job today!</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {habits.map(h => (
          <button key={h.id} onClick={() => { setHabits(prev => prev.map(x => x.id === h.id ? { ...x, done: !x.done } : x)); if (!h.done) speak("Nice job!"); }}
            style={{
              display: "flex", alignItems: "center", gap: 14, padding: 16,
              borderRadius: 18, border: `1.5px solid ${h.done ? T.green + "40" : T.border}`,
              background: h.done ? T.greenGlow : T.surface, cursor: "pointer",
              opacity: h.done ? 0.7 : 1, transition: "all 0.2s ease", textAlign: "left",
            }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              border: `2.5px solid ${h.done ? T.green : T.border}`,
              background: h.done ? T.green : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease", flexShrink: 0,
            }}>
              {h.done && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M5 13l4 4L19 7"/></svg>}
            </div>
            <span style={{ fontSize: 24, flexShrink: 0 }}>{h.emoji}</span>
            <span style={{ fontFamily: T.font, fontSize: 16, fontWeight: 600, color: T.text, textDecoration: h.done ? "line-through" : "none" }}>{h.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
function BottomNav({ screen, setScreen }) {
  const items = [
    { id: "home", emoji: "🏠", label: "Home" },
    { id: "soundboard", emoji: "💬", label: "Talk" },
    { id: "games", emoji: "🎮", label: "Games" },
    { id: "focus", emoji: "🎯", label: "Focus" },
    { id: "calm", emoji: "🫧", label: "Calm" },
  ];
  const activeId = screen.startsWith("game_") ? "games" : screen === "habits" ? "home" : screen;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: T.surface, borderTop: `1.5px solid ${T.border}`,
      display: "flex", justifyContent: "space-around", alignItems: "center",
      padding: "6px 0 max(8px, env(safe-area-inset-bottom))", zIndex: 100,
    }}>
      {items.map(item => (
        <button key={item.id} onClick={() => setScreen(item.id)} style={{
          background: "none", border: "none", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 2, padding: "8px 14px", cursor: "pointer",
          opacity: activeId === item.id ? 1 : 0.4,
          transform: activeId === item.id ? "scale(1.12)" : "scale(1)",
          transition: "all 0.15s ease",
        }}>
          <span style={{ fontSize: 22 }}>{item.emoji}</span>
          <span style={{ fontFamily: T.font, fontSize: 11, fontWeight: activeId === item.id ? 700 : 500, color: activeId === item.id ? T.primary : T.soft }}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("home");
  const screens = {
    home: <HomeScreen setScreen={setScreen} />,
    soundboard: <SoundboardScreen setScreen={setScreen} />,
    games: <GamesScreen setScreen={setScreen} />,
    game_words: <WordGameScreen setScreen={setScreen} />,
    game_colors: <ColorGameScreen setScreen={setScreen} />,
    game_patterns: <PatternGameScreen setScreen={setScreen} />,
    game_math: <MathGameScreen setScreen={setScreen} />,
    focus: <FocusScreen setScreen={setScreen} />,
    calm: <CalmScreen setScreen={setScreen} />,
    habits: <HabitsScreen setScreen={setScreen} />,
  };

  return (
    <div style={{
      background: T.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto",
      fontFamily: T.fontAlt, color: T.text, position: "relative", WebkitFontSmoothing: "antialiased",
    }}>
      <style>{`* { box-sizing: border-box; } button { -webkit-tap-highlight-color: transparent; } ::-webkit-scrollbar { display: none; }`}</style>
      {screens[screen] || <HomeScreen setScreen={setScreen} />}
      <BottomNav screen={screen} setScreen={setScreen} />
    </div>
  );
}
