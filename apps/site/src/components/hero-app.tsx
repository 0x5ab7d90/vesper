import { useEffect, useLayoutEffect, useRef, useState } from "react"

import data from "@/data/hero-demo.json"
import "./hero-app.css"

const IMG = "https://image.tmdb.org/t/p"
const APP_W = 1440
const APP_H = 920
const AUTOPLAY_MS = 7000

const img = (path: string | null, size: string) =>
  path ? `${IMG}/${size}${path}` : ""
const avatar = (seed: string) =>
  `https://api.dicebear.com/10.x/disco/svg?seed=${encodeURIComponent(seed)}`

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function timeLeft(positionSec: number, durationSec: number): string {
  const minutes = Math.round(Math.max(0, durationSec - positionSec) / 60)
  if (minutes < 60) return `${minutes}m left`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m left` : `${h}h left`
}

/* ---- icons, copied from the desktop set ---- */
const Svg = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p} />
)
const Stroke = {
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const
const ChevronLeft = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      d="M15.00 20L8.41 13.41C7.63 12.63 7.63 11.36 8.41 10.58L15.00 4"
      {...Stroke}
    />
  </Svg>
)
const ChevronRight = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      d="M9 4L15.58 10.58C16.36 11.36 16.36 12.63 15.58 13.41L9 20"
      {...Stroke}
    />
  </Svg>
)
const Home = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      d="M14.1829 3.6403C12.8776 2.70584 11.1224 2.70584 9.81708 3.6403L4.56708 7.39882C3.58351 8.10297 3 9.23833 3 10.448V17.2499C3 19.321 4.67893 20.9999 6.75 20.9999H8.75C9.16421 20.9999 9.5 20.6641 9.5 20.2499V16.7499C9.5 15.3692 10.6193 14.2499 12 14.2499C13.3807 14.2499 14.5 15.3692 14.5 16.7499V20.2499C14.5 20.6641 14.8358 20.9999 15.25 20.9999H17.25C19.3211 20.9999 21 19.321 21 17.2499V10.448C21 9.23833 20.4165 8.10297 19.4329 7.39882L14.1829 3.6403Z"
      fill="currentColor"
    />
  </Svg>
)
const Search = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      d="M20.25 20.25L16.5 16.5M16.5 16.5C18 15 18.75 13 18.75 11C18.75 6.71 15.29 3.25 11 3.25C6.71 3.25 3.25 6.71 3.25 11C3.25 15.29 6.71 18.75 11 18.75C13 18.75 15 18 16.5 16.5Z"
      {...Stroke}
    />
  </Svg>
)
const Plus = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      d="M11.25 18.75V12.75H5.25C4.83 12.75 4.5 12.41 4.5 12C4.5 11.58 4.83 11.25 5.25 11.25H11.25V5.25C11.25 4.83 11.58 4.5 12 4.5C12.41 4.5 12.75 4.83 12.75 5.25V11.25H18.75C19.16 11.25 19.5 11.58 19.5 12C19.5 12.41 19.16 12.75 18.75 12.75H12.75V18.75C12.75 19.16 12.41 19.5 12 19.5C11.58 19.5 11.25 19.16 11.25 18.75Z"
      fill="currentColor"
    />
  </Svg>
)
const SidebarLeft = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M9 5.5V18.5H19.25C19.94 18.5 20.5 17.94 20.5 17.25V6.75C20.5 6.05 19.94 5.5 19.25 5.5H9ZM2 6.75C2 5.23 3.23 4 4.75 4H19.25C20.76 4 22 5.23 22 6.75V17.25C22 18.76 20.76 20 19.25 20H4.75C3.23 20 2 18.76 2 17.25V6.75Z"
      fill="currentColor"
    />
  </Svg>
)
const SidebarRight = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M15 5.5V18.5H4.75C4.05 18.5 3.5 17.94 3.5 17.25V6.75C3.5 6.05 4.05 5.5 4.75 5.5H15ZM22 6.75C22 5.23 20.76 4 19.25 4H4.75C3.23 4 2 5.23 2 6.75V17.25C2 18.76 3.23 20 4.75 20H19.25C20.76 20 22 18.76 22 17.25V6.75Z"
      fill="currentColor"
    />
  </Svg>
)
const Projects = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      d="M19.1564 10C20.9595 10 22.2754 11.7065 21.8166 13.4502L20.5646 18.2041C20.1311 19.8514 18.6421 20.9999 16.9386 21H7.06364C5.36027 20.9998 3.87117 19.8514 3.43766 18.2041L2.18571 13.4502C1.72688 11.7065 3.04287 10.0001 4.84587 10H19.1564Z"
      fill="currentColor"
    />
    <path
      d="M19.2511 6.5C19.6654 6.5 20.0011 6.83579 20.0011 7.25C20.0011 7.66421 19.6654 8 19.2511 8H4.75114C4.33701 7.9999 4.00114 7.66415 4.00114 7.25C4.00114 6.83585 4.33701 6.5001 4.75114 6.5H19.2511Z"
      fill="currentColor"
    />
    <path
      d="M17.2511 3C17.6654 3 18.0011 3.33579 18.0011 3.75C18.0011 4.16421 17.6654 4.5 17.2511 4.5H6.75114C6.33701 4.4999 6.00114 4.16415 6.00114 3.75C6.00114 3.33585 6.33701 3.0001 6.75114 3H17.2511Z"
      fill="currentColor"
    />
  </Svg>
)
const Play = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      d="M9.24 2.36C7.41 1.18 5 2.49 5 4.67V19.32C5 21.50 7.41 22.81 9.24 21.63L20.56 14.30C22.23 13.22 22.23 10.77 20.56 9.69L9.24 2.36Z"
      fill="currentColor"
    />
  </Svg>
)
const Heart = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      d="M12 4.32C12.19 4.18 12.43 4.02 12.73 3.86C13.52 3.43 14.67 3 16.11 3C17.59 3 19.08 3.59 20.19 4.78C21.30 5.97 22 7.71 22 9.93C22 13.25 19.64 16.02 17.39 17.89C16.24 18.84 15.07 19.60 14.13 20.12C13.66 20.38 13.24 20.59 12.91 20.73C12.74 20.81 12.59 20.87 12.46 20.91C12.35 20.94 12.17 21 12 21C11.82 21 11.64 20.94 11.53 20.91C11.40 20.87 11.25 20.81 11.08 20.73C10.75 20.59 10.33 20.38 9.86 20.12C8.92 19.60 7.75 18.84 6.60 17.89C4.35 16.02 2 13.25 2 9.93C2 7.71 2.69 5.97 3.80 4.78C4.91 3.59 6.40 3 7.88 3C9.32 3 10.47 3.43 11.26 3.86C11.56 4.02 11.80 4.18 12 4.32Z"
      fill="currentColor"
    />
  </Svg>
)
const Star = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      d="M13.36 1.85C12.81 0.71 11.18 0.71 10.63 1.85L8.26 6.78L2.81 7.50C1.55 7.66 1.04 9.21 1.97 10.09L5.95 13.84L4.95 19.21C4.72 20.46 6.04 21.41 7.15 20.81L12.00 18.21L16.83 20.81C17.94 21.41 19.27 20.46 19.04 19.21L18.04 13.84L22.02 10.09C22.95 9.21 22.44 7.66 21.18 7.50L15.72 6.78L13.36 1.85Z"
      fill="currentColor"
    />
  </Svg>
)
const Pin = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      d="M4.01 12.32L7.31 15.62L3.21 19.71C2.92 20.01 2.92 20.48 3.21 20.78C3.51 21.07 3.98 21.07 4.28 20.78L8.37 16.68L11.67 19.98C13.27 21.58 15.99 20.68 16.34 18.46L17.08 13.65C17.14 13.24 17.40 12.89 17.77 12.71L20.52 11.39C22.23 10.57 22.62 8.31 21.28 6.97L17.02 2.71C15.68 1.37 13.42 1.76 12.60 3.47L11.28 6.22C11.10 6.59 10.75 6.85 10.34 6.91L5.53 7.65C3.31 8.00 2.41 10.72 4.01 12.32Z"
      fill="currentColor"
    />
  </Svg>
)
const Clapper = (p: React.SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path
      d="M21 15.60L20.56 15.43L19.94 13.83C19.63 13.03 18.86 12.5 18 12.5C17.19 12.5 16.46 12.96 16.12 13.68L16.05 13.83L15.43 15.43L13.83 16.05C13.03 16.36 12.5 17.13 12.5 18C12.5 18.86 13.03 19.63 13.83 19.94L15.43 20.56L15.60 21H5.75C4.23 21 3 19.76 3 18.25V9.5H21V15.60Z"
      fill="currentColor"
    />
    <path
      d="M7.20 8H3V5.75C3 4.23 4.23 3 5.75 3H8.87L7.20 8Z"
      fill="currentColor"
    />
    <path d="M13.45 8H8.79L10.45 3H15.12L13.45 8Z" fill="currentColor" />
    <path
      d="M18.25 3C19.76 3 21 4.23 21 5.75V8H15.04L16.70 3H18.25Z"
      fill="currentColor"
    />
    <path
      d="M19.24 16.18L18.54 14.37C18.45 14.14 18.24 14 18 14C17.75 14 17.54 14.14 17.45 14.37L16.75 16.18C16.65 16.44 16.44 16.65 16.18 16.75L14.37 17.45C14.14 17.54 14 17.75 14 18C14 18.24 14.14 18.45 14.37 18.54L16.18 19.24C16.44 19.34 16.65 19.55 16.75 19.81L17.45 21.62C17.54 21.85 17.75 22 18 22C18.24 22 18.45 21.85 18.54 21.62L19.24 19.81C19.34 19.55 19.55 19.34 19.81 19.24L21.62 18.54C21.85 18.45 22 18.24 22 18C22 17.75 21.85 17.54 21.62 17.45L19.81 16.75C19.55 16.65 19.34 16.44 19.24 16.18Z"
      fill="currentColor"
    />
  </Svg>
)
const Imdb = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 256 128" aria-hidden {...p}>
    <rect width="100%" height="100%" rx="16" fill="#F5C518" />
    <g transform="matrix(4,0,0,4,32,28)" fill="#000">
      <polygon points="0 18 5 18 5 0 0 0" />
      <path d="M 15.67,0 14.55,8.40 13.85,3.83 C 13.65,2.37 13.46,1.09 13.27,0 H 7 v 18 h 4.24 L 11.25,6.11 13.04,18 h 3.01 L 17.75,5.85 17.77,18 H 22 V 0 Z" />
      <path d="M 24 18 v -18 h 7.80 c 1.76 0 3.19 1.41 3.19 3.17 v 11.64 c 0 1.75 -1.42 3.17 -3.19 3.17 z m 5.83 -14.76 c -0.19 -0.10 -0.57 -0.15 -1.12 -0.15 v 11.81 c 0.72 0 1.17 -0.13 1.34 -0.40 c 0.16 -0.26 0.25 -1.00 0.25 -2.19 v -6.97 c 0 -0.81 -0.03 -1.33 -0.08 -1.56 c -0.05 -0.23 -0.18 -0.39 -0.38 -0.50 z" />
      <path d="m 44.42 4.50 h 0.31 c 1.79 0 3.25 1.40 3.25 3.13 v 7.21 c 0 1.73 -1.45 3.13 -3.25 3.13 h -0.31 c -1.09 0 -2.06 -0.52 -2.65 -1.33 l -0.28 1.10 h -4.48 v -17.76 h 4.78 v 5.78 c 0.61 -0.77 1.57 -1.27 2.64 -1.27 z m -1.02 8.77 v -4.26 c 0 -0.70 -0.04 -1.16 -0.13 -1.38 c -0.09 -0.21 -0.47 -0.34 -0.73 -0.34 s -0.67 0.11 -0.75 0.29 v 7.21 c 0.09 0.20 0.47 0.31 0.75 0.31 s 0.66 -0.11 0.74 -0.31 c 0.08 -0.20 0.12 -0.71 0.12 -1.52 z" />
    </g>
  </svg>
)
const Metacritic = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 1316 1316" aria-hidden {...p}>
    <path
      fill="#FECE36"
      d="M 614.57 1316 C 610.24 1313.85 547.77 1306.7 536.18 1304.48 C 509.25 1299.36 482.68 1292.54 456.61 1284.07 C 330.89 1243.28 220.37 1165.56 139.49 1061.03 C 45.25 940.76 -0.23 796.90 2.62 644.86 C 3.24 579.61 14.01 514.86 34.53 452.93 C 88.40 288.05 205.51 151.29 360.13 72.67 C 516.77 -5.78 697.96 -19.59 864.69 34.22 C 1071.32 102.63 1230.99 268.43 1291.56 477.49 C 1301.42 510.94 1307.43 544.31 1311.57 578.89 C 1312.45 586.23 1313.1 612.09 1316 617.01 L 1316 701.77 C 1312.67 709.26 1310.38 752.34 1308.27 765.55 C 1303.86 792.05 1297.89 818.26 1290.39 844.06 C 1235.29 1030.34 1100.98 1182.92 923.18 1261.18 C 874.31 1282.55 823.05 1297.95 770.50 1307.06 C 759.97 1308.84 749.31 1310.45 738.76 1311.97 C 729.92 1313.24 710.56 1313.18 703.48 1316 L 614.57 1316 z"
    />
    <path
      fill="#000"
      d="M 629.55 143.42 C 913.34 128.77 1155.23 347.07 1169.66 630.87 C 1184.09 914.68 965.60 1156.39 681.79 1170.61 C 398.28 1184.81 156.89 966.61 142.47 683.11 C 128.06 399.62 346.07 158.06 629.55 143.42 z"
    />
    <path
      fill="#FEFEFE"
      d="M 725.69 221.42 C 729.29 220.85 735.93 220.87 739.75 220.90 C 836.76 221.56 907.32 305.60 969.59 367.88 L 1126.68 524.95 C 1114.92 535.59 1099.5 551.91 1087.95 563.46 L 1014.41 636.85 C 1002.83 622.77 982.39 604.39 969.15 591.15 L 884.6 506.61 L 832.47 454.51 C 803.26 425.33 767.40 386.36 723.08 384.77 C 682.55 383.31 652.22 420.20 652.4 459.23 C 652.58 501.01 678.03 523.96 705.21 551.17 L 746.47 592.45 L 902.76 748.86 C 865.60 784.43 827.18 824.23 790.61 860.72 C 782.80 851.56 765.70 835.48 756.75 826.53 L 690.74 760.55 L 617.31 687.05 C 596.35 666.07 573.67 641.74 549.36 625.19 C 533.70 615.50 517.37 607.67 498.78 607.55 C 459.09 607.30 429.09 643.63 430.19 682.00 C 430.67 698.82 435.96 719.11 445.15 733.28 C 455.40 749.07 470.73 763.14 483.93 776.35 L 527.34 819.78 L 679.60 971.79 L 567.32 1083.96 C 551.78 1066.31 525.50 1041.55 508.38 1024.44 L 397.75 913.79 C 335.58 851.61 273.96 788.91 208.81 729.82 C 204 725.45 199.60 721.15 194.45 717.14 L 291.32 620.05 C 303.71 630.34 336.89 657.97 349.49 665.75 C 342.69 631.28 343.81 592.29 357.41 559.70 C 392.30 476.11 478.56 418.29 568.06 454.05 C 567.16 449.45 566.78 443.96 566.35 439.29 C 561.13 383.60 572.24 330.51 609.11 287.13 C 640.08 250.70 677.26 225.76 725.69 221.42 z"
    />
  </svg>
)

/* ---- pieces ---- */

function Bar({
  value,
  variant = "plain",
}: {
  value: number
  /** plain: the app's hairline track. light: over artwork. splash: the
   *  interior.dev bar the splash screen uses. */
  variant?: "plain" | "light" | "splash"
}) {
  const cls =
    variant === "plain" ? "ha__bar" : `ha__bar ha__bar--${variant}`
  return (
    <div className={cls}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

function Featured() {
  const slides = data.featured
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setInterval(
      () => setI((n) => (n + 1) % slides.length),
      AUTOPLAY_MS
    )
    return () => clearInterval(t)
  }, [paused, slides.length])

  return (
    <div
      className="ha__carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="ha__track"
        style={{ transform: `translateX(-${i * 100}%)` }}
      >
        {slides.map((m, n) => {
          return (
            <div className="ha__slide" key={m.id} aria-hidden={n !== i}>
              <section className="ha__hero" aria-label={m.title}>
                <div
                  className="ha__layer ha__layer--poster"
                  style={{ backgroundImage: `url(${img(m.poster, "w780")})` }}
                />
                <div
                  className="ha__layer ha__layer--backdrop"
                  style={{
                    backgroundImage: `url(${img(m.backdrop, "w1280")})`,
                  }}
                />
                <div className="ha__layer ha__layer--fade" />
                <div className="ha__herobody">
                  <div className="ha__herorow">
                    <div className="ha__herocol">
                      {m.logo ? (
                        <img
                          className="ha__logo"
                          src={m.logo}
                          alt={m.title}
                          width={380}
                          height={110}
                          loading={n === 0 ? "eager" : "lazy"}
                          decoding="async"
                        />
                      ) : (
                        <h1 className="ha__title">{m.title}</h1>
                      )}
                      <div className="ha__tags">
                        <span>{m.tags.join(", ")}</span>
                        <span className="ha__chip">{m.rating}</span>
                      </div>
                      <p className="ha__desc">{m.description}</p>
                      <div className="ha__meta">
                        <span>{m.year}</span>
                        <span>{m.runtime}</span>
                        {m.metacritic ? (
                          <span>
                            <Metacritic style={{ width: 16, height: 16 }} />
                            {m.metacritic}
                          </span>
                        ) : null}
                        {m.imdb ? (
                          <span>
                            <Imdb style={{ height: 14, width: "auto" }} />
                            {m.imdb}
                          </span>
                        ) : null}
                      </div>
                      <div className="ha__actions">
                        <span className="ha__play">
                          <Play />
                          Play
                        </span>
                        <span className="ha__soft">
                          <Plus />
                        </span>
                        <span className="ha__soft">
                          <Star />
                        </span>
                      </div>
                    </div>
                    <div className="ha__credits">
                      <div>
                        <b>Starring</b>
                        <span>{m.starring}</span>
                      </div>
                      <div>
                        <b>Director</b>
                        <span>{m.director}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )
        })}
      </div>
      <div className="ha__dots">
        {slides.map((m, n) => (
          <button
            key={m.id}
            type="button"
            aria-label={`Show ${m.title}`}
            aria-current={n === i ? "true" : undefined}
            onClick={() => setI(n)}
          />
        ))}
      </div>
    </div>
  )
}

function Library({ version }: { version?: string }) {
  return (
    <aside className="ha__aside">
      <header className="ha__asidehead">
        <h2>Library</h2>
        <div>
          <span className="ha__iconbtn">
            <Plus style={{ width: 18, height: 18 }} />
          </span>
          <span className="ha__iconbtn">
            <SidebarLeft style={{ width: 18, height: 18 }} />
          </span>
        </div>
      </header>
      <ul className="ha__lists">
        <li className="ha__list">
          <div className="ha__cover ha__cover--liked">
            <Heart style={{ width: 20, height: 20 }} />
          </div>
          <div className="ha__listtext">
            <span className="ha__listname">Favorites</span>
            <span className="ha__listcount">31 titles</span>
          </div>
        </li>
        <li className="ha__list">
          <div className="ha__cover ha__cover--watched">
            <Clapper style={{ width: 20, height: 20 }} />
          </div>
          <div className="ha__listtext">
            <span className="ha__listname">Watched</span>
            <span className="ha__listcount">477 titles</span>
          </div>
        </li>
        {data.lists.map((l) => {
          const [a, b, c, d] = l.posters.map((p) => img(p, "w154"))
          return (
            <li className="ha__list" key={l.name}>
              <div className="ha__cover">
                <div className="ha__collage">
                  <div style={{ backgroundImage: `url(${a})` }} />
                  <div>
                    <div style={{ backgroundImage: `url(${b})` }} />
                    <div style={{ backgroundImage: `url(${c})` }} />
                    <div style={{ backgroundImage: `url(${d})` }} />
                  </div>
                </div>
              </div>
              <div className="ha__listtext">
                <span className="ha__listname">
                  <span className="truncate">{l.name}</span>
                  {l.pinned ? <Pin /> : null}
                </span>
                <span className="ha__listcount">{l.count} titles</span>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="ha__foot">
        <span>{version ? `Vesper ${version}` : "Vesper"}</span>
        <span aria-hidden>·</span>
        <span>Feedback</span>
      </div>
    </aside>
  )
}

function Friends() {
  return (
    <aside className="ha__aside ha__aside--right">
      <header className="ha__asidehead">
        <h2>Friends</h2>
        <span className="ha__iconbtn">
          <SidebarRight style={{ width: 18, height: 18 }} />
        </span>
      </header>
      <ul className="ha__friends">
        {data.friends.map((f) => {
          const show =
            f.season && f.episode
              ? `${f.title}, S${pad(f.season)}E${pad(f.episode)}`
              : f.title
          const watching =
            f.status === "watching" && f.positionSec && f.durationSec
          const paused =
            f.status === "paused" && f.positionSec && f.durationSec
          return (
            <li className="ha__friend" key={f.name}>
              <div
                className="ha__friendposter"
                style={{ backgroundImage: `url(${img(f.poster, "w154")})` }}
                aria-label={show}
              />
              <div className="ha__friendtext">
                <div className="ha__friendname">
                  <span className="ha__miniavatar">
                    <img
                      className="ha__avatar"
                      src={avatar(f.name)}
                      alt=""
                      aria-hidden
                    />
                    <span
                      className={
                        f.status === "offline"
                          ? "ha__dot ha__dot--offline"
                          : "ha__dot"
                      }
                    />
                  </span>
                  <span className="truncate">{f.name}</span>
                </div>
                <span className="ha__friendshow truncate">{show}</span>
                {watching ? (
                  <div className="ha__friendmeta">
                    <Bar
                      value={(f.positionSec! / f.durationSec!) * 100}
                      variant="splash"
                    />
                    <span>{timeLeft(f.positionSec!, f.durationSec!)}</span>
                  </div>
                ) : paused ? (
                  <span className="ha__friendmeta">
                    Paused, {timeLeft(f.positionSec!, f.durationSec!)}
                  </span>
                ) : (
                  <span className="ha__friendmeta">{f.ago}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

function ContinueWatching() {
  return (
    <section className="ha__section">
      <h2 className="ha__sectiontitle">Continue Watching</h2>
      <div className="ha__row">
        {data.continueWatching.map((c) => {
          const left = timeLeft(c.positionSec, c.durationSec)
          const label =
            c.season && c.episode
              ? `S${pad(c.season)}E${pad(c.episode)} · ${left}`
              : left
          return (
            <div
              className="ha__continue"
              key={c.title}
              style={{ backgroundImage: `url(${img(c.backdrop, "w780")})` }}
              aria-label={c.title}
            >
              {c.logo ? (
                <img
                  src={c.logo}
                  alt={c.title}
                  width={130}
                  height={36}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="truncate">{c.title}</span>
              )}
              <div className="ha__continuefoot">
                <Play />
                <Bar
                  value={(c.positionSec / c.durationSec) * 100}
                  variant="light"
                />
                <span>{label}</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Trending() {
  return (
    <section className="ha__section">
      <h2 className="ha__sectiontitle">Trending Now</h2>
      <div className="ha__row">
        {data.trending.map((t) => (
          <div
            className="ha__poster"
            key={t.title}
            style={{ backgroundImage: `url(${img(t.poster, "w342")})` }}
            aria-label={t.title}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * The app window in the hero. Laid out at the desktop's own pixel sizes and
 * scaled to whatever width the frame gives it, so nothing re-wraps.
 */
export function HeroApp({ version }: { version?: string }) {
  const outer = useRef<HTMLDivElement>(null)
  // The scale rides on a CSS custom property, never on a React-rendered style,
  // so the server and client markup agree. An inline script in the page sets
  // the same property before hydration, which is what paints the first frame.
  useLayoutEffect(() => {
    const el = outer.current
    if (!el) return
    const measure = () =>
      el.style.setProperty("--ha-scale", String(el.clientWidth / APP_W))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={outer}
      data-hero-app
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${APP_W} / ${APP_H}`,
        overflow: "hidden",
      }}
    >
      <div className="ha">
        <header className="ha__top">
          <div className="ha__lights" aria-hidden>
            <span className="ha__light ha__light--close" />
            <span className="ha__light ha__light--min" />
            <span className="ha__light ha__light--max" />
          </div>
          <nav className="ha__nav">
            <span
              className="ha__iconbtn ha__iconbtn--ink"
              style={{ opacity: 0.4 }}
            >
              <ChevronLeft style={{ width: 16, height: 16 }} />
            </span>
            <span
              className="ha__iconbtn ha__iconbtn--ink"
              style={{ opacity: 0.4 }}
            >
              <ChevronRight style={{ width: 16, height: 16 }} />
            </span>
            <span className="ha__iconbtn ha__iconbtn--ink">
              <Home style={{ width: 18, height: 18 }} />
            </span>
          </nav>
          <div className="ha__search">
            <div className="ha__searchbox">
              <Search style={{ width: 18, height: 18, flexShrink: 0 }} />
              <span className="ha__searchtext">What do you want to watch?</span>
              <span className="ha__searchtrail">
                <span className="ha__searchdivider" />
                <span className="ha__explore">
                  <Projects style={{ width: 19, height: 19 }} />
                </span>
              </span>
            </div>
          </div>
          <div className="ha__account">
            <img
              className="ha__avatar"
              src={avatar("jawad")}
              alt=""
              aria-hidden
              width={32}
              height={32}
            />
          </div>
        </header>
        <div className="ha__body">
          <div className="ha__left">
            <Library version={version} />
          </div>
          <main className="ha__main">
            <div className="ha__mainscroll">
              <Featured />
              <ContinueWatching />
              <Trending />
            </div>
          </main>
          <div className="ha__right">
            <Friends />
          </div>
        </div>
      </div>
    </div>
  )
}
