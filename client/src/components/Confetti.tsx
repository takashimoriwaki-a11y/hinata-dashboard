import { useEffect, useRef } from "react";

interface ConfettiProps {
  active: boolean;
  duration?: number; // ms
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  shape: "rect" | "circle";
}

const COLORS = [
  "#f97316", // オレンジ（ひなたプライマリ）
  "#f59e0b", // アンバー
  "#10b981", // エメラルド
  "#3b82f6", // ブルー
  "#8b5cf6", // パープル
  "#ec4899", // ピンク
  "#fbbf24", // イエロー
  "#34d399", // グリーン
];

function createParticle(canvasWidth: number): Particle {
  return {
    x: Math.random() * canvasWidth,
    y: -10,
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 3 + 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: Math.random() * 8 + 4,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.2,
    opacity: 1,
    shape: Math.random() > 0.5 ? "rect" : "circle",
  };
}

export function Confetti({ active, duration = 3000 }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvasサイズをウィンドウに合わせる
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    particlesRef.current = [];
    startTimeRef.current = performance.now();

    // 初期パーティクルを生成
    for (let i = 0; i < 120; i++) {
      const p = createParticle(canvas.width);
      p.y = Math.random() * canvas.height * 0.3; // 最初から画面上部に散らばる
      particlesRef.current.push(p);
    }

    const animate = (now: number) => {
      if (!canvas || !ctx) return;
      const elapsed = now - (startTimeRef.current ?? now);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 前半1秒間は新しいパーティクルを追加
      if (elapsed < 1000 && particlesRef.current.length < 200) {
        for (let i = 0; i < 3; i++) {
          particlesRef.current.push(createParticle(canvas.width));
        }
      }

      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // 重力
        p.vx *= 0.99; // 空気抵抗
        p.rotation += p.rotationSpeed;

        // durationの後半でフェードアウト
        if (elapsed > duration * 0.6) {
          p.opacity = Math.max(0, p.opacity - 0.02);
        }

        if (p.opacity <= 0 || p.y > canvas.height + 20) return false;

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
        return true;
      });

      if (particlesRef.current.length > 0) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [active, duration]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
