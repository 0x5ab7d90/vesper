import { useId, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { Tooltip } from '@renderer/components/ui/tooltip'

// Profile badges. Each one is a small piece of art with a name and a line of copy; they sit
// after the handle and explain themselves on hover. Earned badges are worked out here from the
// profile and its stats snapshot; hand-given ones are read off the profile.

/** Accounts created before this are Sprouts — the people who were here first. */
export const EARLY_USER_CUTOFF = Date.UTC(2026, 8, 20)
/** Long Haul: finished a film at least this long. */
const LONG_HAUL_MIN = 180
/** Judge: rated at least this many titles. */
const JUDGE_MIN = 100

interface Badge {
  id: string
  name: string
  blurb: string
  Art: (props: { className?: string }) => React.JSX.Element
}

const SPROUT: Badge = {
  id: 'sprout',
  name: 'Sprout',
  blurb: 'Watched Vesper grow from a seed.',
  Art: SproutArt
}

const DEV: Badge = {
  id: 'dev',
  name: 'Dev',
  blurb: 'Builds Vesper.',
  Art: DevArt
}

const LONG_HAUL: Badge = {
  id: 'long-haul',
  name: 'Long Haul',
  blurb: 'Sat through a film over three hours long.',
  Art: HourglassArt
}

const JUDGE: Badge = {
  id: 'judge',
  name: 'Judge',
  blurb: 'Rated a hundred titles.',
  Art: StarHandArt
}

// Hand-granted badges, by the id stored on the profile.
const GRANTED: Record<string, Badge> = { dev: DEV }

type Stats = NonNullable<
  NonNullable<ReturnType<typeof useQuery<typeof api.stats.forUsername>>>['stats']
>

function badgesFor(profile: Doc<'profiles'>, stats: Stats | null | undefined): Badge[] {
  const out: Badge[] = []
  for (const id of profile.badges ?? []) {
    const badge = GRANTED[id]
    if (badge) out.push(badge)
  }
  if (profile.createdAt < EARLY_USER_CUTOFF) out.push(SPROUT)
  const longest = stats?.highlights.longestMovie?.runtimeMin ?? 0
  if (longest >= LONG_HAUL_MIN) out.push(LONG_HAUL)
  if ((stats?.ratings?.count ?? 0) >= JUDGE_MIN) out.push(JUDGE)
  return out
}

export function Badges({
  profile,
  className
}: {
  profile: Doc<'profiles'>
  className?: string
}): React.JSX.Element | null {
  // The stats snapshot is what the Stats tab reads too; it's a cached row, so this is cheap.
  const data = useQuery(api.stats.forUsername, { username: profile.username })
  const badges = badgesFor(profile, data?.stats)
  // One bubble for the whole strip, centred on it, naming whichever badge the pointer is on.
  // Per-badge bubbles ran off the narrow identity column at either end.
  const [hovered, setHovered] = useState<Badge | null>(null)
  if (badges.length === 0) return null
  const shown = hovered ?? badges[0]!
  return (
    <Tooltip
      contentClassName="max-w-[176px] [&>span]:whitespace-normal"
      label={
        <span className="flex flex-col gap-0.5 text-left">
          <span className="text-text">{shown.name}</span>
          <span className="text-text-tertiary">{shown.blurb}</span>
        </span>
      }
      className={className}
    >
      <span className="inline-flex shrink-0 items-center gap-1">
        {badges.map((b) => (
          <span
            key={b.id}
            role="img"
            aria-label={`${b.name} badge: ${b.blurb}`}
            onPointerEnter={() => setHovered(b)}
            className="inline-flex size-[15px] cursor-pointer items-center justify-center"
          >
            <b.Art className="size-full" />
          </span>
        ))}
      </span>
    </Tooltip>
  )
}

/* ---------- art ---------- */

/**
 * The sprout, with a little depth: a light falling from the top-left on the leaves, the soil
 * darkening toward its base, and a soft shadow under the whole thing. Gradient ids are scoped
 * per instance so two badges on one screen don't share paint.
 */
function SproutArt({ className }: { className?: string }): React.JSX.Element {
  const id = useId().replace(/:/g, '')
  const leaf = `leaf-${id}`
  const sheen = `sheen-${id}`
  const soil = `soil-${id}`
  const shadow = `shadow-${id}`
  const LEAVES =
    'M 667.291 644.773 C 671.347 632.138 689.57 588.983 689.943 581.538 C 695.471 471.072 714.921 383.059 797.192 299.243 C 881.091 213.769 1008.69 183.853 1129.83 185.058 C 1126.75 265.215 1119.84 329.134 1084.43 403.052 C 1019.73 538.105 898.684 597.743 752.9 604.115 C 748.747 617.162 740.74 634.746 735.777 648.196 C 719.433 692.484 703.76 742.706 702.777 789.98 C 701.057 809.432 702.037 851.992 702.078 873.249 C 679.847 871.993 654.425 871.44 632.257 873.9 C 631.12 838.587 633.506 799.118 630.528 764.32 C 627.563 729.689 613.493 684.581 602.422 651.55 C 601.102 651.79 599.777 651.996 598.446 652.167 C 521.531 661.882 430.972 640.262 369.666 591.903 C 290.192 529.212 254.002 434.637 241.584 336.824 C 317.918 327.274 389.993 327.507 464.904 353.532 C 570.586 390.247 640.821 487.465 657.195 596.61 C 660.492 618.583 657.324 623.626 667.291 644.773 z'
  const MOUND =
    'M 702.777 789.98 C 703.023 817.978 702.941 845.978 702.531 873.975 C 714.189 874.335 730.44 877.569 741.876 880.123 C 805.122 894.122 862.752 926.675 907.389 973.615 C 919.896 986.894 954.366 1026.32 953.837 1044.85 C 953.703 1050.2 951.433 1055.28 947.533 1058.94 C 943.057 1063.17 936.383 1065.52 930.368 1065.7 C 904.486 1066.44 877.866 1065.84 851.974 1065.81 L 696.813 1065.92 L 501.968 1065.87 C 469.814 1065.88 437.703 1065.99 405.511 1065.88 C 382.522 1065.8 370.276 1050.6 382.546 1029.81 C 399.998 1000.24 423.778 972.14 450.064 950.053 C 493.087 914.078 544.471 889.505 599.483 878.597 C 608.219 876.856 623.467 874.054 632.257 873.9 C 654.425 871.44 679.847 871.993 702.078 873.249 C 702.037 851.992 701.057 809.432 702.777 789.98 z'
  return (
    <svg viewBox="215 160 940 940" aria-hidden className={className}>
      <defs>
        <linearGradient
          id={leaf}
          gradientUnits="userSpaceOnUse"
          x1="234"
          y1="389"
          x2="1058"
          y2="568"
        >
          <stop offset="0" stopColor="#66ba50" />
          <stop offset="1" stopColor="#86dd88" />
        </linearGradient>
        {/* Light from the top-left: bright on the upper leaf edges, gone by the stem. */}
        <linearGradient
          id={sheen}
          gradientUnits="userSpaceOnUse"
          x1="500"
          y1="190"
          x2="720"
          y2="800"
        >
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#1f5a26" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient
          id={soil}
          gradientUnits="userSpaceOnUse"
          x1="660"
          y1="880"
          x2="660"
          y2="1066"
        >
          <stop offset="0" stopColor="#8f5c45" />
          <stop offset="1" stopColor="#5a3628" />
        </linearGradient>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="16" stdDeviation="16" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>
      <g filter={`url(#${shadow})`}>
        <path d={MOUND} fill={`url(#${soil})`} />
        <path d={LEAVES} fill={`url(#${leaf})`} />
        <path d={LEAVES} fill={`url(#${sheen})`} />
        {/* A thin lit rim along the top of the soil where it meets the light. */}
        <path
          d="M 632.257 873.9 C 654.425 871.44 679.847 871.993 702.078 873.249 C 730.44 877.569 760 884 790 894"
          fill="none"
          stroke="#c4906f"
          strokeOpacity="0.55"
          strokeWidth="14"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

/**
 * The hooded mascot at a keyboard. Depth the same way as the sprout — the head lit from the
 * top and deeper violet toward the chin, the eyes domed with an off-centre highlight, the
 * hoodie darker at the shoulders than the cuffs, one soft shadow under it all.
 */
function DevArt({ className }: { className?: string }): React.JSX.Element {
  const id = useId().replace(/:/g, '')
  const head = `head-${id}`
  const eye = `eye-${id}`
  const hood = `hood-${id}`
  const arm = `arm-${id}`
  const shadow = `shadow-${id}`
  const HEAD =
    'M 201.221 426.125 C 201.8 423.49 202.123 419.523 202.469 416.781 C 210.507 353.24 243.754 298.492 283.567 249.833 C 298.742 231.287 315.974 209.343 328.441 188.633 C 335.516 176.725 341.809 164.37 347.281 151.646 C 355.025 133.553 360.539 116.927 372.157 100.278 C 399.86 60.578 452.873 52.208 495.981 69.265 C 517.899 77.938 541.524 98.378 561.183 112.907 C 574.262 122.523 587.759 131.557 601.635 139.981 C 644.387 166.258 691.005 183.252 730.847 213.716 C 801.57 267.792 830.597 325.835 842.968 411.572 C 842.897 419.205 842.966 427.289 842.734 434.876 C 840.565 462.912 835.494 484.106 818.741 507.404 C 772.638 571.52 667.379 614.134 641.896 692.081 C 632.341 678.359 621.57 662.684 607.95 652.534 C 543.17 604.257 460.645 588.595 385.187 563.944 C 329.604 545.786 267.859 532.319 221.935 493.922 C 208.92 482.862 202.96 470.545 200.889 453.783 C 200.494 445.28 201.014 434.776 201.221 426.125 z'
  const EYES = [
    'M 460.279 385.35 C 508.62 381.342 511.214 456.397 524.371 488.464 C 535.258 514.996 522.398 546.357 491.472 551.176 C 449.586 551.739 446.138 518.75 436.849 486.935 C 432.65 469.727 424.108 451.219 422.046 433.685 C 418.895 406.895 434.339 387.96 460.279 385.35 z',
    'M 612.48 338.143 C 656.61 334.909 661.447 376.29 670.06 408.399 C 673.759 422.186 678.756 436.405 681.622 450.383 C 686.82 475.735 674.492 498.716 648.24 503.832 C 632.715 504.551 615.055 500.038 607.595 484.71 C 594.226 456.462 588.191 423.695 579.584 393.649 C 571.765 366.353 584.929 344.241 612.48 338.143 z'
  ]
  const HOOD = [
    'M 201.221 426.125 C 201.014 434.776 200.494 445.28 200.889 453.783 C 190.749 453.597 185.54 465.442 186.211 474.009 C 189.197 512.12 236.138 535.126 266.687 548.809 C 365.424 593.032 477.631 604.47 572.533 657.466 C 590.538 667.52 612.76 688.161 621.241 707.508 C 630.478 729.806 628.064 769.85 627.935 794.729 L 626.774 898.856 C 502.386 906.467 370.634 896.067 248.655 871.279 C 226.501 866.777 177.095 858.63 178.913 828.186 C 183.672 748.485 249.18 692.657 328.112 694.039 C 402.645 692.502 443.572 709.104 509.179 731.856 L 509.217 702.611 C 502.652 702.21 465.632 686.71 455.801 683.53 C 419.608 672.22 381.99 666.114 344.078 665.396 C 293.531 664.318 247.631 675.587 210.465 711.154 C 163.404 699.915 134.918 672.231 119.399 625.986 C 105.616 584.913 109.519 535.024 129.269 496.495 C 142.309 471.057 160.742 449.752 185.287 434.895 C 190.283 431.838 195.74 427.912 201.221 426.125 z',
    'M 842.968 411.572 C 866.596 415.735 892.901 442.714 905.9 460.959 C 946.453 517.879 947.134 600.458 883.177 640.494 C 866.786 650.755 820.134 676.564 802.055 681.062 L 800.354 682.838 L 802.156 690.837 C 803.046 695.168 802.949 706.957 803.02 711.982 C 809.708 708.39 823.203 702.914 830.661 699.793 C 846.714 693.075 859.742 687.041 875.149 679.019 C 903.106 704.262 948.37 795.499 916.773 824.357 C 859.251 876.893 727.696 891.435 653.995 897.023 C 655.967 863.07 655.546 828.671 656.056 794.631 C 656.934 768.608 654.421 739.103 660.359 713.804 C 665.636 691.326 686.611 663.023 702.736 646.758 C 754.087 594.963 832.888 558.611 857.661 486.007 C 863.705 468.294 864.834 441.396 842.734 434.876 C 842.966 427.289 842.897 419.205 842.968 411.572 z'
  ]
  const ARMS = [
    'M 510.194 683.186 C 519.058 675.979 542.894 670.03 548.372 680.897 C 558.176 700.348 548.524 738.639 552.895 760.182 L 552.782 760.875 C 551.598 776.416 555.66 826.719 548.939 837.272 C 547.421 839.655 545.049 840.912 542.331 841.476 C 531.843 843.654 519.364 843.133 510.345 837.29 C 508.551 826.443 509.184 807.987 509.24 796.573 C 509.478 775.002 509.458 753.428 509.179 731.856 L 509.217 702.611 C 509.352 696.675 509.284 688.878 510.194 683.186 z',
    'M 758.266 705.927 C 758.192 682.306 756.29 673.373 788.38 676.565 C 793.302 677.055 797.401 678.657 800.354 682.838 L 802.156 690.837 C 801.182 724.192 802.054 757.708 801.766 791.093 C 801.654 804.037 802.652 818.201 800.928 830.948 C 800.544 833.785 799.974 835.855 797.806 837.897 C 791.864 843.495 781.467 842.415 773.931 841.99 C 769.527 841.741 764.826 840.988 761.737 837.494 C 755.51 830.449 758.393 755.653 758.455 740.979 C 758.918 729.914 758.432 717.116 758.266 705.927 z'
  ]
  const CREASES = [
    'M 552.895 760.182 C 553.711 751.526 552.262 737.236 553.786 730.643 C 565.046 724.622 598.609 767.023 552.782 760.875 L 552.895 760.182 z',
    'M 758.266 705.927 C 758.432 717.116 758.918 729.914 758.455 740.979 C 747.643 742.714 734.696 757.553 718.871 764.28 C 712.569 759.907 705.288 754.663 710.038 746.759 C 716.532 735.951 747.239 709.55 758.266 705.927 z'
  ]
  // The art spans x 109–947, y 52–906; a square box centred on it.
  return (
    <svg viewBox="88 39 880 880" aria-hidden className={className}>
      <defs>
        <linearGradient id={head} gradientUnits="userSpaceOnUse" x1="520" y1="60" x2="520" y2="700">
          <stop offset="0" stopColor="#b48cff" />
          <stop offset="0.5" stopColor="#9b60fe" />
          <stop offset="1" stopColor="#7742dd" />
        </linearGradient>
        {/* Domed eye: bright off-centre top-left, settling to the flat grey at the rim. */}
        <radialGradient id={eye} cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#e6e5e8" />
          <stop offset="1" stopColor="#c4c2c9" />
        </radialGradient>
        <linearGradient
          id={hood}
          gradientUnits="userSpaceOnUse"
          x1="520"
          y1="420"
          x2="520"
          y2="906"
        >
          <stop offset="0" stopColor="#535467" />
          <stop offset="1" stopColor="#35363f" />
        </linearGradient>
        <linearGradient id={arm} gradientUnits="userSpaceOnUse" x1="650" y1="675" x2="650" y2="842">
          <stop offset="0" stopColor="#a49ce6" />
          <stop offset="1" stopColor="#7f78bf" />
        </linearGradient>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="16" stdDeviation="16" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>
      <g filter={`url(#${shadow})`}>
        <path d={HEAD} fill={`url(#${head})`} />
        {/* Light catching the crown of the hood. */}
        <path
          d="M 372.157 100.278 C 399.86 60.578 452.873 52.208 495.981 69.265 C 517.899 77.938 541.524 98.378 561.183 112.907"
          fill="none"
          stroke="#e2d4ff"
          strokeOpacity="0.55"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {EYES.map((d) => (
          <path key={d.slice(0, 12)} d={d} fill={`url(#${eye})`} />
        ))}
        {HOOD.map((d) => (
          <path key={d.slice(0, 12)} d={d} fill={`url(#${hood})`} />
        ))}
        {ARMS.map((d) => (
          <path key={d.slice(0, 12)} d={d} fill={`url(#${arm})`} />
        ))}
        {CREASES.map((d) => (
          <path key={d.slice(0, 12)} d={d} fill="#303031" />
        ))}
      </g>
    </svg>
  )
}

/**
 * The hourglass. Depth the same way as the sprout — the frame lit at the top and darker at
 * the base, the glass with a highlight down its left side, the sand brighter where it piles
 * and deeper in the falling stream, one soft shadow under it all.
 */
function HourglassArt({ className }: { className?: string }): React.JSX.Element {
  const id = useId().replace(/:/g, '')
  const frame = `frame-${id}`
  const glass = `glass-${id}`
  const sand = `sand-${id}`
  const shadow = `shadow-${id}`
  const FRAME =
    'M 248.666 121.409 C 259.615 120.191 295.175 121.037 307.968 121.05 L 427.073 121.091 L 625.911 121.041 C 661.136 121.052 696.386 120.916 731.522 121.467 C 769.02 122.634 786.264 146.771 787.316 181.398 C 788.362 215.829 778.38 237.215 745.058 250.65 C 743.768 310.044 738.906 343.729 711.721 398.087 C 696.429 426.536 677.248 450.841 655.551 474.573 C 644.886 486.239 606.95 512.755 617.187 529.256 C 625.826 541.828 640.229 551.566 651.058 562.522 C 710.648 622.807 744.322 687.493 744.973 773.278 C 753.896 776.488 759.93 778.875 767.234 785.168 C 779.058 795.321 786.272 809.825 787.235 825.38 C 789.888 866.329 776.508 897.165 730.527 899.437 L 412.206 899.429 L 306.291 899.633 C 285.96 899.671 265.123 900.094 244.851 898.982 C 237.484 898.527 229.107 895.631 222.572 892.202 C 200.307 880.048 194.422 860.833 194.403 837.472 C 194.378 805.461 205.935 783.328 238.009 773.287 C 239.154 673.024 286.256 602.906 358.727 538.452 C 369.067 529.013 373.94 519.192 361.849 508.411 C 281.933 437.147 236.42 359.41 238.154 250.417 C 215.261 243.177 197.634 224.173 195.135 199.876 C 190.964 159.313 202.443 125.493 248.666 121.409 z'
  const GLASS =
    'M 293.021 251.554 C 317.162 250.474 343.719 250.961 368.049 250.959 L 488.721 250.981 L 614.283 250.954 C 638.658 250.952 665.693 250.456 689.911 251.418 C 690.709 338.749 652.746 404.282 589.023 462.332 C 522.888 522.579 564.021 557.993 614.774 606.783 C 656.378 646.359 691.717 711.911 690 771.918 C 677.521 772.135 665.039 772.188 652.559 772.078 L 331.837 772.012 C 319.191 772.492 305.412 773.122 292.82 772.272 C 290.404 716.006 322.925 657.21 360.17 615.807 C 392.885 579.44 456.3 542.88 416.157 486.143 C 403.17 467.786 383.806 453.142 368.897 436.319 C 319.048 383.012 291.436 325.156 293.021 251.554 z'
  const SAND =
    'M 331.837 772.012 C 336.6 721.964 360.792 675.776 399.222 643.362 C 423.348 623.259 470.434 606.111 470.21 571.965 C 470.081 552.373 474.361 509.931 466.366 492.642 C 450.439 461.717 417.355 439.393 395.054 412.502 C 387.032 402.828 355.58 375.318 376.821 362.533 C 417.836 337.845 461.129 385.179 511.039 372.039 C 537.337 365.116 611.726 334.026 613.275 378.498 C 613.896 393.228 558.166 442.104 547.466 454.654 C 537.419 466.438 520.771 476.214 516.567 494.973 C 510.35 519.612 507.114 572.179 520.462 594.102 C 528.3 606.976 552.857 618.931 564.744 627.852 C 612.538 660.608 647.749 713.397 652.559 772.078 L 331.837 772.012 z'
  // The art spans x 190–790, y 121–900; a square box centred on it.
  return (
    <svg viewBox="90 110 800 800" aria-hidden className={className}>
      <defs>
        <linearGradient
          id={frame}
          gradientUnits="userSpaceOnUse"
          x1="490"
          y1="121"
          x2="490"
          y2="900"
        >
          <stop offset="0" stopColor="#4a5068" />
          <stop offset="0.5" stopColor="#33384c" />
          <stop offset="1" stopColor="#23273a" />
        </linearGradient>
        {/* Glass: a highlight down the left, clear to the right. */}
        <linearGradient
          id={glass}
          gradientUnits="userSpaceOnUse"
          x1="293"
          y1="500"
          x2="690"
          y2="500"
        >
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#d4d2ec" />
          <stop offset="1" stopColor="#bfbcdc" />
        </linearGradient>
        {/* Sand: lit where it heaps at the top and bottom, deeper through the neck. */}
        <linearGradient
          id={sand}
          gradientUnits="userSpaceOnUse"
          x1="490"
          y1="340"
          x2="490"
          y2="772"
        >
          <stop offset="0" stopColor="#ab8dff" />
          <stop offset="0.45" stopColor="#7a4ff0" />
          <stop offset="1" stopColor="#8e66fe" />
        </linearGradient>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="16" stdDeviation="16" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>
      <g filter={`url(#${shadow})`}>
        <path d={FRAME} fill={`url(#${frame})`} />
        {/* Light along the top cap. */}
        <path
          d="M 248.666 121.409 C 259.615 120.191 295.175 121.037 307.968 121.05 L 731.522 121.467"
          fill="none"
          stroke="#8a90ab"
          strokeOpacity="0.6"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path d={GLASS} fill={`url(#${glass})`} />
        <path d={SAND} fill={`url(#${sand})`} />
      </g>
    </svg>
  )
}

/**
 * A hand holding up a star. Depth: the star lit at its top point and amber toward the base,
 * the hand warmer on the palm than at the wrist, a lit edge on the star's upper arms, one
 * soft shadow under it all.
 */
function StarHandArt({ className }: { className?: string }): React.JSX.Element {
  const id = useId().replace(/:/g, '')
  const hand = `hand-${id}`
  const star = `star-${id}`
  const shadow = `shadow-${id}`
  const HAND =
    'M 857.069 868.807 C 860.23 864.909 879.733 848.772 884.457 844.977 C 914.885 820.533 945.547 795.068 975.976 770.713 C 987.173 761.923 998.509 753.312 1009.98 744.884 C 1045.39 718.54 1089.7 685.371 1125.73 731.922 C 1128.6 731.869 1138.42 726.154 1141.82 724.35 C 1191.94 697.761 1256.41 715.35 1264.85 777.271 C 1267.74 798.424 1256.2 822.941 1243.15 839.282 C 1227.09 857.669 1198.64 874.485 1178.91 889.557 C 1153.82 908.714 1127.74 927.132 1102.5 945.935 L 962.243 1050.48 C 848.082 1136.2 836.028 1151.13 689.982 1139.37 L 584.807 1130.64 C 562.847 1128.91 531.582 1125.28 510.349 1128.27 C 489.579 1131.2 459.867 1140.48 442.676 1152.79 C 432.339 1160.18 428.717 1166.63 420.916 1174.51 C 405.761 1189.82 384.512 1226.6 362.244 1228.17 C 350.069 1229.03 340.525 1222.49 332.335 1214.9 C 300.009 1184.95 268.572 1153.48 236.983 1122.8 L 192.295 1079.58 C 182.917 1070.49 174.081 1061.84 165.198 1052.26 C 143.87 1029.26 151.757 1014.73 170.796 993.662 L 240.246 917.468 C 256.293 899.66 276.561 875.966 293.864 860.078 C 339.603 818.22 398.537 793.669 460.467 790.675 C 525.514 787.533 586.564 812.686 649.758 822.408 C 701.603 830.384 755.291 831.428 807.385 837.319 C 817.499 838.463 832.58 843.266 840.611 849.766 C 845.854 854.054 853.467 866.436 857.069 868.807 z'
  const THUMB =
    'M 857.069 868.807 C 860.23 864.909 879.733 848.772 884.457 844.977 C 914.885 820.533 945.547 795.068 975.976 770.713 C 987.173 761.923 998.509 753.312 1009.98 744.884 C 1045.39 718.54 1089.7 685.371 1125.73 731.922 C 1122.9 735.157 1086.52 758.541 1079.23 763.476 C 1029.51 797.337 980.241 831.862 931.444 867.043 C 920.075 875.124 894.922 889.495 886.38 897.856 C 885.726 913.869 884.356 927.539 875.154 941.383 C 828.185 1012.04 735.785 988.943 665.051 984.04 C 645.819 982.707 616.349 982.158 598.653 978.035 C 592.477 972.259 586.164 966.149 594.531 957.916 C 602.623 949.955 613.835 950.648 624.213 951.369 C 680.101 954.758 740.362 966.2 795.956 959.093 C 808.877 957.441 827.765 948.067 837.491 939.362 C 849.403 928.7 858.149 913.285 859.627 897.106 C 860.573 886.76 856.409 877.82 857.069 868.807 z'
  const STAR =
    'M 683.849 176.204 C 690.567 175.656 697.324 176.517 703.69 178.731 C 727.716 187.105 738.792 220.973 749.161 242.737 L 795.217 340.881 C 828.205 348.887 940.832 360.045 959.305 374.687 C 968.768 382.187 974.589 393.62 975.964 405.506 C 977.048 414.876 975.304 424.543 970.493 432.713 C 962.759 445.849 948.758 457.245 937.968 467.97 L 893.683 512.329 C 881.878 524.183 870.102 535.425 859.599 548.472 C 864.789 578.563 870.236 608.61 875.94 638.608 C 879.93 659.424 884.868 681.006 886.646 702.064 C 888.199 720.464 869.15 740.282 852.749 745.612 C 844.484 748.265 835.625 748.447 827.258 746.135 C 815.579 742.819 795.115 730.055 783.566 723.916 C 752.496 707.401 721.857 689.409 690.654 673.155 C 682.746 671.737 662.594 684.186 654.846 688.349 L 586.019 725.837 C 569.291 734.945 548.1 749.642 529.095 747.858 C 511.246 746.183 488.984 726.025 488.091 707.689 C 487.275 690.931 493.513 671.77 495.838 655.154 C 501.583 619.561 510.553 583.471 515.283 547.72 C 507.34 537.665 491.514 522.741 482.169 513.544 L 434.647 466.241 C 421.289 452.887 402.11 436.79 399.128 417.488 C 397.146 405.392 400.126 393.008 407.395 383.139 C 423.762 361.262 454.506 362.706 479.672 357.821 C 513.082 351.335 546.99 345.475 580.67 340.666 C 598.876 308.291 612.215 273.42 628.725 240.272 C 644.33 208.942 646.253 184.302 683.849 176.204 z'
  // The art spans x 150–1265, y 176–1229; a square box centred on it.
  return (
    <svg viewBox="143 137 1130 1130" aria-hidden className={className}>
      <defs>
        <linearGradient
          id={hand}
          gradientUnits="userSpaceOnUse"
          x1="700"
          y1="760"
          x2="700"
          y2="1230"
        >
          <stop offset="0" stopColor="#f6e6d2" />
          <stop offset="1" stopColor="#dcc6ab" />
        </linearGradient>
        <linearGradient
          id={star}
          gradientUnits="userSpaceOnUse"
          x1="690"
          y1="176"
          x2="690"
          y2="748"
        >
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="0.55" stopColor="#fecf5a" />
          <stop offset="1" stopColor="#e9ac2a" />
        </linearGradient>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="20" stdDeviation="20" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>
      <g filter={`url(#${shadow})`}>
        <path d={HAND} fill={`url(#${hand})`} />
        <path d={THUMB} fill="#f4d6b4" />
        <path d={STAR} fill={`url(#${star})`} />
        {/* Light along the star's upper arms. */}
        <path
          d="M 580.67 340.666 C 598.876 308.291 612.215 273.42 628.725 240.272 C 644.33 208.942 646.253 184.302 683.849 176.204 C 690.567 175.656 697.324 176.517 703.69 178.731 C 727.716 187.105 738.792 220.973 749.161 242.737 L 795.217 340.881"
          fill="none"
          stroke="#fff1bf"
          strokeOpacity="0.6"
          strokeWidth="16"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
