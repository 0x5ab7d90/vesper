/* The drop hugging a heart. A still companion to the animated drop mascot: same purple, same
   gloss recipe (shade, rim, specular, soft shadow), drawn once for brand moments like the
   feedback thank-you. Colours derive from --color-mascot so the two never drift apart. */

const BODY =
  'M 182.942 753.717 C 177.721 745.968 172.122 737.941 167.326 729.958 C 123.029 656.231 114.729 559.186 135.236 476.525 C 151.488 411.021 185.431 353.006 230.432 303.184 C 254.528 276.505 282.269 248.95 303.737 220.121 C 315.645 203.848 326.823 187.053 337.239 169.788 C 344.949 157.196 355.411 138.768 364.634 128.156 C 371.018 120.829 378.563 114.601 386.967 109.721 C 455.02 69.499 512.967 140.372 566.857 171.208 C 585.062 181.624 603.603 192.697 622.755 201.301 C 707.262 239.266 777.817 290.481 825.533 372.197 C 875.044 457.709 888.892 559.278 864.082 654.923 C 861.972 662.889 851.804 697.769 846.74 700.72 C 843.747 698.808 844.991 681.441 844.702 676.049 C 843.189 642.694 830.104 610.908 807.697 586.154 C 774.032 548.735 736.791 537.915 688.061 535.371 C 668.068 537.484 647.019 541.194 628.34 548.855 C 593.327 565.912 572.114 581.034 548.751 613.657 C 535.994 600.572 522.276 588.459 507.711 577.422 C 480.593 560.777 459.541 553.416 428.232 548.491 C 333.874 539.159 248.402 602.93 250.866 701.607 C 250.378 701.72 249.89 701.84 249.404 701.966 C 217.843 709.976 199.214 726.359 182.942 753.717 z'
const EYE_R =
  'M 628.34 548.855 C 623.109 542.488 616.802 538.551 612.26 531.17 C 606.261 521.423 587.38 444.021 585.525 429.68 C 584.587 422.427 584.45 414.969 586.2 407.821 C 588.76 397.322 595.548 388.35 604.955 383.033 C 614.9 377.203 626.797 375.698 637.88 378.869 C 648.789 382.005 659.156 389.538 664.667 399.574 C 670.397 410.011 692.507 492.549 693.24 505.427 C 693.83 515.805 690.817 525.51 688.061 535.371 C 668.068 537.484 647.019 541.194 628.34 548.855 z'
const EYE_L =
  'M 428.232 548.491 C 423.482 529.429 408.878 477.949 409.418 460.468 C 409.599 452.577 411.772 444.859 415.735 438.032 C 431.709 410.853 475.495 411.75 488.903 436.787 C 502.417 462.021 507.375 506.821 515.94 534.592 C 520.931 550.776 517.333 562.669 508.529 576.192 C 508.261 576.605 507.988 577.015 507.711 577.422 C 480.593 560.777 459.541 553.416 428.232 548.491 z'
const HEART =
  'M 692.81 561.429 C 694.178 561.381 695.58 561.405 696.953 561.42 C 730.43 561.582 762.42 575.27 785.654 599.372 C 814.762 629.233 820.263 659.13 819.871 698.753 C 803.054 700.847 793.631 703.342 778.065 710.449 C 723.043 735.573 683.946 812.35 712.309 870.095 C 686.769 893.426 598.775 965.952 567.91 972.758 C 547.167 977.332 434.734 905.284 412.308 889.116 L 396.674 877.322 C 430.765 805.391 386.295 731.149 315.071 705.249 C 301.968 700.485 288.608 699.193 274.768 698.515 C 277.332 596.718 383.268 547.632 470.224 586.445 C 501.105 600.229 521.05 619.37 543.076 644.37 C 545.18 646.757 547.812 647.14 550.812 647.037 C 558.43 644.428 572.06 621.707 579.554 613.838 C 612.367 579.383 646.21 563.917 692.81 561.429 z'
const HAND_L =
  'M 270.808 724.399 C 342.94 718.577 414.524 808.673 368.575 874.177 C 355.018 893.504 332.639 900.891 310.253 904.286 C 235.911 909.138 162.735 816.795 214.534 751.113 C 228.352 733.592 249.363 726.352 270.808 724.399 z'
const HAND_R =
  'M 817.565 724.291 C 834.166 723.023 851.827 725.545 865.302 735.903 C 903.359 765.154 889.571 822.189 864.407 854.888 C 847.607 876.718 827.544 891.045 800.387 894.695 C 694.998 901.834 710.392 742.313 817.565 724.291 z'
const SPARK =
  'M 823.76 116.192 C 851.545 114.107 859.872 127.735 874.135 147.936 C 875.731 146.569 877.352 145.23 878.996 143.921 C 891.3 134.072 902.485 127.937 919.075 129.866 C 941.226 132.442 955.151 150.998 951.856 173.002 C 948.333 196.531 928.237 212.72 910.495 226.366 C 900.449 233.248 861.212 259.849 850.905 252.205 C 830.503 237.073 810.432 209.008 799.081 186.474 C 784.788 158.1 788.775 125.256 823.76 116.192 z'

const INK = 'var(--color-mascot, #7a3fe4)'
const HEART_INK = '#fe6e70'

export function HeartDrop({
  size = 96,
  className
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={className}
      style={{ width: size, height: size, display: 'inline-block', lineHeight: 0 }}
      role="img"
      aria-label="Vesper hugging a heart"
    >
      <svg viewBox="80 60 900 940" width={size} height={size} aria-hidden="true">
        <defs>
          <clipPath id="heart-drop-clip">
            <path d={BODY} />
          </clipPath>
          <linearGradient id="heart-drop-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: `color-mix(in oklch, ${INK} 72%, white)` }} />
            <stop offset="0.55" style={{ stopColor: INK }} />
            <stop offset="1" style={{ stopColor: `color-mix(in oklch, ${INK} 78%, black)` }} />
          </linearGradient>
          <linearGradient id="heart-drop-heart-grad" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0"
              style={{ stopColor: `color-mix(in oklch, ${HEART_INK} 80%, white)` }}
            />
            <stop offset="0.5" style={{ stopColor: HEART_INK }} />
            <stop
              offset="1"
              style={{ stopColor: `color-mix(in oklch, ${HEART_INK} 82%, black)` }}
            />
          </linearGradient>
          <radialGradient id="heart-drop-shade" cx="0.35" cy="0.3" r="0.85">
            <stop offset="0.55" stopColor="#1e46aa" stopOpacity="0" />
            <stop offset="1" stopColor="#1e46aa" stopOpacity="0.38" />
          </radialGradient>
          <filter id="heart-drop-soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="28" />
          </filter>
        </defs>

        {/* soft ground shadow */}
        <path
          d={BODY}
          fill="#000"
          opacity="0.35"
          transform="translate(0 50)"
          filter="url(#heart-drop-soft)"
        />

        {/* body with the drop's gloss recipe */}
        <path d={BODY} fill="url(#heart-drop-grad)" />
        <g clipPath="url(#heart-drop-clip)">
          <path d={BODY} fill="url(#heart-drop-shade)" />
          <path
            d={BODY}
            fill="none"
            stroke="#fff"
            strokeWidth="56"
            opacity="0.55"
            filter="url(#heart-drop-soft)"
          />
          <path d={BODY} fill="none" stroke="#fff" strokeWidth="16" opacity="0.5" />
          <ellipse
            cx="360"
            cy="300"
            rx="80"
            ry="120"
            fill="#fff"
            opacity="0.3"
            transform="rotate(28 360 300)"
            filter="url(#heart-drop-soft)"
          />
        </g>

        {/* eyes squeezed shut in a smile */}
        <path d={EYE_L} fill="#fdfcfc" />
        <path d={EYE_R} fill="#fdfcfc" />

        {/* the heart, hugged from both sides */}
        <path d={HEART} fill="url(#heart-drop-heart-grad)" />
        <path d={HAND_L} fill="url(#heart-drop-grad)" />
        <path d={HAND_R} fill="url(#heart-drop-grad)" />

        {/* the little heart floating off the top-right */}
        <path d={SPARK} fill={HEART_INK} />
      </svg>
    </span>
  )
}
