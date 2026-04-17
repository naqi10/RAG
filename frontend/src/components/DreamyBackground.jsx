/**
 * Full-bleed dreamy backdrop: animated pastel gradient, soft blobs, bubbles, sparkles, corner florals.
 * Parent must be `relative overflow-hidden` with defined size.
 */
export default function DreamyBackground() {
  return (
    <div className="dreamy-bg-root absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="dreamy-gradient-layer absolute inset-0" />
      <div className="dreamy-noise absolute inset-0 opacity-[0.04]" />

      {/* Soft glowing blobs */}
      <div className="dreamy-blob dreamy-blob-1 absolute w-[min(55vw,420px)] h-[min(55vw,420px)] rounded-full -top-24 -left-20" />
      <div className="dreamy-blob dreamy-blob-2 absolute w-[min(50vw,380px)] h-[min(50vw,380px)] rounded-full top-1/3 -right-32" />
      <div className="dreamy-blob dreamy-blob-3 absolute w-[min(45vw,340px)] h-[min(45vw,340px)] rounded-full bottom-0 left-1/4" />

      {/* Floating bubbles */}
      <span className="dreamy-float-bubble dreamy-fb-1 absolute w-16 h-16 rounded-full border-2 border-white/50 bg-white/20" style={{ left: "8%", top: "18%" }} />
      <span className="dreamy-float-bubble dreamy-fb-2 absolute w-10 h-10 rounded-full border border-white/40 bg-[#FEC8D8]/30" style={{ left: "78%", top: "12%" }} />
      <span className="dreamy-float-bubble dreamy-fb-3 absolute w-14 h-14 rounded-full border-2 border-white/45 bg-[#E0BBE4]/25" style={{ left: "65%", top: "55%" }} />
      <span className="dreamy-float-bubble dreamy-fb-4 absolute w-8 h-8 rounded-full border border-white/35 bg-white/25" style={{ left: "18%", top: "62%" }} />
      <span className="dreamy-float-bubble dreamy-fb-5 absolute w-12 h-12 rounded-full border border-[#FF9AA2]/40 bg-[#FFC0CB]/20" style={{ left: "42%", top: "8%" }} />
      <span className="dreamy-float-bubble dreamy-fb-6 absolute w-20 h-20 rounded-full border-2 border-white/30 bg-gradient-to-br from-white/30 to-[#FEC8D8]/20" style={{ left: "88%", top: "72%" }} />

      {/* Sparkles */}
      {[["12%", "22%", "0.6s"], ["88%", "28%", "1.1s"], ["25%", "85%", "0.8s"], ["72%", "88%", "1.4s"], ["50%", "40%", "0.3s"], ["6%", "48%", "1s"], ["94%", "52%", "0.7s"], ["35%", "12%", "1.2s"]].map(([l, t, d], i) => (
        <span
          key={i}
          className="dreamy-sparkle absolute text-[10px] leading-none select-none"
          style={{ left: l, top: t, animationDelay: d }}
        >
          ✦
        </span>
      ))}

      {/* Corner florals — abstract SVG */}
      <svg className="absolute -left-4 -bottom-6 w-40 h-40 text-[#E0BBE4]/40 dreamy-floral-sway" viewBox="0 0 120 120" fill="none">
        <path
          d="M60 100c-8-18-22-32-38-40 12 8 24 22 30 40M60 100c10-16 24-28 42-36-14 10-26 24-32 36M60 20c6 14 14 26 24 36-10-6-18-16-24-28M60 20c-8 12-16 22-26 30 8-8 16-18 26-22"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <circle cx="60" cy="48" r="6" fill="currentColor" opacity="0.35" />
        <circle cx="38" cy="72" r="4" fill="currentColor" opacity="0.25" />
        <circle cx="82" cy="70" r="4" fill="currentColor" opacity="0.25" />
      </svg>
      <svg className="absolute -right-2 -top-4 w-36 h-36 text-[#FF9AA2]/35 dreamy-floral-sway-alt" viewBox="0 0 100 100" fill="none">
        <path
          d="M50 88C38 72 28 58 18 48c12 6 22 18 32 32M50 88c14-12 26-26 38-38-12 8-24 20-32 26M50 12c-4 16-10 30-18 42 8-10 14-22 18-34M50 12c8 14 16 26 26 36-8-8-16-20-26-26"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path d="M50 42l4 8 8 2-8 4-4 8-4-8-8-4 8-2z" fill="currentColor" opacity="0.3" />
      </svg>
    </div>
  );
}
