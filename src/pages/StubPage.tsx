import { motion } from "framer-motion";

interface StubPageProps {
  title: string;
}

const funEmojis: Record<string, string> = {
  "QR Hub": "📱",
  "Active Timers": "⏱️",
  "Data Export": "📊",
  "Client Portal": "🌐",
};

const funCopy: Record<string, string> = {
  "QR Hub": "QR magic is brewing…",
  "Active Timers": "Tick tock, this page is almost ready!",
  "Data Export": "Crunching numbers behind the scenes…",
  "Client Portal": "Building a portal to another dimension…",
};

export default function StubPage({ title }: StubPageProps) {
  const emoji = funEmojis[title] ?? "🚧";
  const copy = funCopy[title] ?? "Something awesome is cooking!";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6"
    >
      <span className="text-6xl mb-4">{emoji}</span>
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground mt-2">{copy}</p>
      <p className="text-xs text-muted-foreground/60 mt-1">Coming soon ✨</p>
    </motion.div>
  );
}
