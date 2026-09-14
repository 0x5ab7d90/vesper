import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  'aria-hidden': true
} as const

export const ChevronLeftIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M15.00 20L8.41 13.41C7.63 12.63 7.63 11.36 8.41 10.58L15.00 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const ChevronRightIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M9 4L15.58 10.58C16.36 11.36 16.36 12.63 15.58 13.41L9 20"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const SearchIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M20.25 20.25L16.5 16.5M16.5 16.5C18 15 18.75 13 18.75 11C18.75 6.71 15.29 3.25 11 3.25C6.71 3.25 3.25 6.71 3.25 11C3.25 15.29 6.71 18.75 11 18.75C13 18.75 15 18 16.5 16.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const BellIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M12 2C7.79 2 4.19 5.17 3.75 9.35L2.98 14.33C2.73 15.99 4.01 17.5 5.70 17.5H18.29C19.98 17.5 21.26 15.99 21.01 14.33L20.25 9.35C19.80 5.17 16.20 2 12 2Z"
      fill="currentColor"
    />
    <path
      d="M16.58 19H7.41C8.18 20.76 9.94 22 12 22C14.05 22 15.81 20.76 16.58 19Z"
      fill="currentColor"
    />
  </svg>
)

export const PlusIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M11.25 18.75V12.75H5.25C4.83 12.75 4.5 12.41 4.5 12C4.5 11.58 4.83 11.25 5.25 11.25H11.25V5.25C11.25 4.83 11.58 4.5 12 4.5C12.41 4.5 12.75 4.83 12.75 5.25V11.25H18.75C19.16 11.25 19.5 11.58 19.5 12C19.5 12.41 19.16 12.75 18.75 12.75H12.75V18.75C12.75 19.16 12.41 19.5 12 19.5C11.58 19.5 11.25 19.16 11.25 18.75Z"
      fill="currentColor"
    />
  </svg>
)

export const ArrowRotateSparkleIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M3.90 10.22C4.31 10.27 4.60 10.65 4.55 11.06C4.51 11.36 4.5 11.68 4.5 12C4.50 16.14 7.85 19.5 12 19.5C14.22 19.5 16.26 18.53 17.65 17H15.26C14.84 17 14.51 16.66 14.51 16.25C14.51 15.83 14.84 15.5 15.26 15.5H19.26C19.67 15.5 20.01 15.83 20.01 16.25V20.25C20.01 20.66 19.67 21 19.26 21C18.84 21 18.51 20.66 18.51 20.25V18.27C16.85 19.95 14.52 21 12 21C7.02 21 3.00 16.97 3 12C3 11.61 3.02 11.24 3.06 10.87C3.12 10.46 3.49 10.17 3.90 10.22Z"
      fill="currentColor"
    />
    <path
      d="M18 4C18.24 4 18.45 4.14 18.54 4.37L19.24 6.18C19.34 6.44 19.55 6.65 19.81 6.75L21.62 7.45C21.85 7.54 22 7.75 22 8C22 8.24 21.85 8.45 21.62 8.54L19.81 9.24C19.55 9.34 19.34 9.55 19.24 9.81L18.54 11.62C18.45 11.85 18.24 12 18 12C17.75 12 17.54 11.85 17.45 11.62L16.75 9.81C16.65 9.55 16.44 9.34 16.18 9.24L14.37 8.54C14.14 8.45 14 8.24 14 8C14 7.75 14.14 7.54 14.37 7.45L16.18 6.75C16.44 6.65 16.65 6.44 16.75 6.18L17.45 4.37C17.54 4.14 17.75 4 18 4Z"
      fill="currentColor"
    />
    <path
      d="M11.99 3C12.41 3 12.74 3.33 12.74 3.75C12.74 4.16 12.41 4.5 11.99 4.5C9.77 4.50 7.74 5.46 6.34 7H8.75C9.16 7 9.5 7.33 9.5 7.75C9.5 8.16 9.16 8.5 8.75 8.5H4.75C4.33 8.5 4 8.16 4 7.75V3.75C4 3.33 4.33 3 4.75 3C5.16 3 5.5 3.33 5.5 3.75V5.71C7.15 4.03 9.47 3.00 11.99 3Z"
      fill="currentColor"
    />
  </svg>
)

export const SidebarLeftIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M9 5.5V18.5H19.25C19.94 18.5 20.5 17.94 20.5 17.25V6.75C20.5 6.05 19.94 5.5 19.25 5.5H9ZM2 6.75C2 5.23 3.23 4 4.75 4H19.25C20.76 4 22 5.23 22 6.75V17.25C22 18.76 20.76 20 19.25 20H4.75C3.23 20 2 18.76 2 17.25V6.75Z"
      fill="currentColor"
    />
  </svg>
)

export const SidebarRightIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M15 5.5V18.5H4.75C4.05 18.5 3.5 17.94 3.5 17.25V6.75C3.5 6.05 4.05 5.5 4.75 5.5H15ZM22 6.75C22 5.23 20.76 4 19.25 4H4.75C3.23 4 2 5.23 2 6.75V17.25C2 18.76 3.23 20 4.75 20H19.25C20.76 20 22 18.76 22 17.25V6.75Z"
      fill="currentColor"
    />
  </svg>
)

export const PlayIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M9.24 2.36C7.41 1.18 5 2.49 5 4.67V19.32C5 21.50 7.41 22.81 9.24 21.63L20.56 14.30C22.23 13.22 22.23 10.77 20.56 9.69L9.24 2.36Z"
      fill="currentColor"
    />
  </svg>
)

export const PeopleGroupIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M12.25 14C14.3245 14 15.9998 15.689 16 17.7646V19.25C16 19.6642 15.6642 20 15.25 20H2.75C2.33579 20 2 19.6642 2 19.25V17.7646C2.0002 15.689 3.67553 14 5.75 14H12.25Z"
      fill="currentColor"
    />
    <path
      d="M18.25 14C20.3245 14 21.9998 15.689 22 17.7646V19C22 19.5523 21.5523 20 21 20H17.5V17.7646L17.4932 17.4941C17.424 16.1294 16.8351 14.8985 15.9189 14H18.25Z"
      fill="currentColor"
    />
    <path
      d="M9 4C11.4853 4 13.5 6.01472 13.5 8.5C13.5 10.9853 11.4853 13 9 13C6.51472 13 4.5 10.9853 4.5 8.5C4.5 6.01472 6.51472 4 9 4Z"
      fill="currentColor"
    />
    <path
      d="M15 4C17.4853 4 19.5 6.01472 19.5 8.5C19.5 10.9853 17.4853 13 15 13C14.7953 13 14.594 12.9845 14.3965 12.958C14.0679 12.8103 13.721 12.6959 13.3604 12.6182C14.3757 11.5434 15 10.0952 15 8.5C15 6.87843 14.3549 5.40892 13.3096 4.3291C13.8316 4.11733 14.402 4 15 4Z"
      fill="currentColor"
    />
  </svg>
)

export const HomeIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M14.1829 3.6403C12.8776 2.70584 11.1224 2.70584 9.81708 3.6403L4.56708 7.39882C3.58351 8.10297 3 9.23833 3 10.448V17.2499C3 19.321 4.67893 20.9999 6.75 20.9999H8.75C9.16421 20.9999 9.5 20.6641 9.5 20.2499V16.7499C9.5 15.3692 10.6193 14.2499 12 14.2499C13.3807 14.2499 14.5 15.3692 14.5 16.7499V20.2499C14.5 20.6641 14.8358 20.9999 15.25 20.9999H17.25C19.3211 20.9999 21 19.321 21 17.2499V10.448C21 9.23833 20.4165 8.10297 19.4329 7.39882L14.1829 3.6403Z"
      fill="currentColor"
    />
  </svg>
)

export const CompassIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M21.25 12C21.25 17.1086 17.1086 21.25 12 21.25C6.89137 21.25 2.75 17.1086 2.75 12C2.75 6.89137 6.89137 2.75 12 2.75C17.1086 2.75 21.25 6.89137 21.25 12Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M14.6558 8.73023L10.5513 9.84965C10.2097 9.94281 9.94281 10.2097 9.84965 10.5513L8.73023 14.6558C8.62843 15.0291 8.97092 15.3716 9.34417 15.2698L13.4487 14.1504C13.7903 14.0572 14.0572 13.7903 14.1504 13.4487L15.2698 9.34417C15.3716 8.97092 15.0291 8.62843 14.6558 8.73023Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
)

export const ProjectsIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
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
  </svg>
)

export const HeartIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M12 4.32C12.19 4.18 12.43 4.02 12.73 3.86C13.52 3.43 14.67 3 16.11 3C17.59 3 19.08 3.59 20.19 4.78C21.30 5.97 22 7.71 22 9.93C22 13.25 19.64 16.02 17.39 17.89C16.24 18.84 15.07 19.60 14.13 20.12C13.66 20.38 13.24 20.59 12.91 20.73C12.74 20.81 12.59 20.87 12.46 20.91C12.35 20.94 12.17 21 12 21C11.82 21 11.64 20.94 11.53 20.91C11.40 20.87 11.25 20.81 11.08 20.73C10.75 20.59 10.33 20.38 9.86 20.12C8.92 19.60 7.75 18.84 6.60 17.89C4.35 16.02 2 13.25 2 9.93C2 7.71 2.69 5.97 3.80 4.78C4.91 3.59 6.40 3 7.88 3C9.32 3 10.47 3.43 11.26 3.86C11.56 4.02 11.80 4.18 12 4.32Z"
      fill="currentColor"
    />
  </svg>
)

export const StarSolidIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M13.36 1.85C12.81 0.71 11.18 0.71 10.63 1.85L8.26 6.78C8.26 6.78 8.26 6.78 8.26 6.78L2.81 7.50C1.55 7.66 1.04 9.21 1.97 10.09L5.95 13.84C5.95 13.84 5.95 13.85 5.95 13.85L4.95 19.21C4.72 20.46 6.04 21.41 7.15 20.81L11.99 18.21C11.99 18.20 12.00 18.20 12.00 18.21L16.83 20.81C17.94 21.41 19.27 20.46 19.04 19.21L18.04 13.85C18.04 13.85 18.03 13.84 18.04 13.84L22.02 10.09C22.95 9.21 22.44 7.66 21.18 7.50L15.73 6.78C15.73 6.78 15.72 6.78 15.72 6.78L13.36 1.85Z"
      fill="currentColor"
    />
  </svg>
)

export const EyeSolidIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 4C15.87 4.00 19.65 6.31 22.18 10.74C22.62 11.52 22.62 12.47 22.18 13.25C19.65 17.68 15.87 20 12 19.99C8.12 19.99 4.34 17.68 1.81 13.25C1.37 12.47 1.37 11.52 1.81 10.74C4.34 6.31 8.12 3.99 12 4ZM8.37 12C8.37 9.99 9.99 8.37 12 8.37C14.00 8.37 15.62 9.99 15.62 12C15.62 14.00 14.00 15.62 12 15.62C9.99 15.62 8.37 14.00 8.37 12Z"
      fill="currentColor"
    />
  </svg>
)

export const EyeIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z"
      stroke="currentColor"
      strokeWidth="1.6"
      fill="none"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" fill="none" />
  </svg>
)

export const EyeOffIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M3 3L21 21M9.88 5.08C10.56 4.94 11.27 4.86 12 4.86C19 4.86 22 11.86 22 11.86C22 11.86 21.06 14.04 19 16M6.32 6.32C3.5 8.5 2 12 2 12C2 12 5 19 12 19C13.7 19 15.18 18.62 16.45 18.05M9.9 9.9C9.36 10.44 9 11.18 9 12C9 13.66 10.34 15 12 15C12.82 15 13.56 14.64 14.1 14.1"
      stroke="currentColor"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
)

export const UserIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M15.9297 12.1094C18.3289 13.1913 20 15.6018 20 18.4043C19.9998 19.8378 18.8378 20.9998 17.4043 21H6.5957C5.16224 20.9998 4.00024 19.8378 4 18.4043C4 15.6021 5.6706 13.1915 8.06934 12.1094C9.14306 12.979 10.5107 13.5 12 13.5C13.4891 13.5 14.856 12.9787 15.9297 12.1094Z"
      fill="currentColor"
    />
    <path
      d="M12 2.5C14.6234 2.5 16.75 4.62665 16.75 7.25C16.75 9.87335 14.6234 12 12 12C9.37665 12 7.25 9.87335 7.25 7.25C7.25 4.62665 9.37665 2.5 12 2.5Z"
      fill="currentColor"
    />
  </svg>
)

export const SettingsIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M9.93786 3.10362C10.3975 2.41414 11.1713 2 12 2C12.8287 2 13.6025 2.41414 14.0621 3.10362L14.4492 3.68429C14.8478 4.28207 15.5747 4.57074 16.2748 4.40919L16.6566 4.32107C17.5033 4.12568 18.3909 4.38024 19.0053 4.99467C19.6198 5.6091 19.8743 6.4967 19.6789 7.34338L19.5908 7.72523C19.4293 8.42528 19.7179 9.15223 20.3157 9.55075L20.8964 9.93786C21.5859 10.3975 22 11.1713 22 12C22 12.8287 21.5859 13.6025 20.8964 14.0621L20.3157 14.4492C19.7179 14.8478 19.4293 15.5747 19.5908 16.2748L19.6789 16.6566C19.8743 17.5033 19.6198 18.3909 19.0053 19.0053C18.3909 19.6198 17.5033 19.8743 16.6566 19.6789L16.2748 19.5908C15.5747 19.4293 14.8478 19.7179 14.4492 20.3157L14.0621 20.8964C13.6025 21.5859 12.8287 22 12 22C11.1713 22 10.3975 21.5859 9.93786 20.8964L9.55075 20.3157C9.15223 19.7179 8.42528 19.4293 7.72523 19.5908L7.34338 19.6789C6.4967 19.8743 5.6091 19.6198 4.99467 19.0053C4.38025 18.3909 4.12568 17.5033 4.32107 16.6566L4.40919 16.2748C4.57074 15.5747 4.28207 14.8478 3.68429 14.4492L3.10362 14.0621C2.41414 13.6025 2 12.8287 2 12C2 11.1713 2.41414 10.3975 3.10362 9.93786L3.68429 9.55075C4.28207 9.15223 4.57074 8.42528 4.40919 7.72523L4.32107 7.34338C4.12568 6.49671 4.38024 5.6091 4.99467 4.99467C5.6091 4.38024 6.4967 4.12568 7.34338 4.32107L7.72523 4.40919C8.42528 4.57074 9.15223 4.28207 9.55075 3.68429L9.93786 3.10362ZM8.875 12C8.875 10.2741 10.2741 8.875 12 8.875C13.7259 8.875 15.125 10.2741 15.125 12C15.125 13.7259 13.7259 15.125 12 15.125C10.2741 15.125 8.875 13.7259 8.875 12Z"
      fill="currentColor"
    />
  </svg>
)

export const HelpIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.47 2 2 6.47 2 12C2 17.52 6.47 22 12 22C17.52 22 22 17.52 22 12C22 6.47 17.52 2 12 2ZM11.25 8.5C10.83 8.5 10.5 8.83 10.5 9.25C10.5 9.66 10.16 10 9.75 10C9.33 10 9 9.66 9 9.25C9 8.00 10.00 7 11.25 7H12.45C13.86 7 15 8.13 15 9.54C15 10.39 14.57 11.18 13.86 11.65L13.30 12.03C12.95 12.26 12.75 12.65 12.75 13.07V13.25C12.75 13.66 12.41 14 12 14C11.58 14 11.25 13.66 11.25 13.25V13.07C11.25 12.15 11.70 11.29 12.47 10.78L13.03 10.40C13.32 10.21 13.5 9.88 13.5 9.54C13.5 8.96 13.03 8.5 12.45 8.5H11.25ZM12 15C11.44 15 11 15.44 11 16C11 16.55 11.44 17 12 17C12.55 17 13 16.55 13 16C13 15.44 12.55 15 12 15Z"
      fill="currentColor"
    />
  </svg>
)

export const SignOutIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M21 12C21 12.1989 20.921 12.3897 20.7803 12.5303L16.2803 17.0303C15.9874 17.3232 15.5126 17.3232 15.2197 17.0303C14.9268 16.7374 14.9268 16.2626 15.2197 15.9697L18.4393 12.75L9 12.75C8.58579 12.75 8.25 12.4142 8.25 12C8.25 11.5858 8.58579 11.25 9 11.25L18.4393 11.25L15.2197 8.03033C14.9268 7.73744 14.9268 7.26256 15.2197 6.96967C15.5126 6.67678 15.9874 6.67678 16.2803 6.96967L20.7803 11.4697C20.921 11.6103 21 11.8011 21 12Z"
      fill="currentColor"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 3.75C12 4.16421 11.6642 4.5 11.25 4.5L6.75 4.5C5.50736 4.5 4.5 5.50736 4.5 6.75L4.5 17.25C4.5 18.4926 5.50736 19.5 6.75 19.5H11.25C11.6642 19.5 12 19.8358 12 20.25C12 20.6642 11.6642 21 11.25 21H6.75C4.67893 21 3 19.3211 3 17.25L3 6.75C3 4.67893 4.67893 3 6.75 3L11.25 3C11.6642 3 12 3.33579 12 3.75Z"
      fill="currentColor"
    />
  </svg>
)

export const LockIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M6 10V8C6 4.68 8.68 2 12 2C15.31 2 18 4.68 18 8V10M5.75 21.25H18.25C19.35 21.25 20.25 20.35 20.25 19.25V12C20.25 10.89 19.35 10 18.25 10H5.75C4.64 10 3.75 10.89 3.75 12V19.25C3.75 20.35 4.64 21.25 5.75 21.25Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const CheckIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M4.5 12.75L9.75 18L19.5 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const CloseIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M6 6L18 18M6 18L18 6"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const AlertCircleIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M12 8V13M12 16.5V16.51"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
)

export const FullscreenIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M13.75 3.75H20.25V10.25"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3.75 13.75V20.25H10.25"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19.47 4.52L13.75 10.25"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.25 13.75L4.52 19.47"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const VolumeOnIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M11 5L6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M15.5 9a4 4 0 0 1 0 6M18.5 6a8 8 0 0 1 0 12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
)

export const VolumeOffIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M11 5L6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const DiscordIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} viewBox="0 0 24 24" {...props}>
    <path
      fill="#5865F2"
      d="M20.31 4.37a19.79 19.79 0 0 0-4.88-1.51a.074.07 0 0 0-.079.03c-.21.37-.444.86-.608 1.25a18.27 18.27 0 0 0-5.48 0a12.64 12.64 0 0 0-.617-1.25a.077.07 0 0 0-.079-.037A19.7 19.7 0 0 0 3.67 4.37a.07.07 0 0 0-.032.02C.533 9.04-.32 13.58.09 18.05a.082.08 0 0 0 .031.05a19.9 19.9 0 0 0 5.99 3.03a.078.07 0 0 0 .084-.028a14.09 14.09 0 0 0 1.22-1.99a.076.07 0 0 0-.041-.106a13.10 13.10 0 0 1-1.87-.892a.077.07 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.07 0 0 1 .077-.01c3.92 1.79 8.18 1.79 12.06 0a.074.07 0 0 1 .078.01c.12.09.246.19.373.29a.077.07 0 0 1-.006.12a12.29 12.29 0 0 1-1.87.892a.077.07 0 0 0-.041.10c.36.69.772 1.36 1.22 1.99a.076.07 0 0 0 .084.02a19.84 19.84 0 0 0 6.00-3.03a.077.07 0 0 0 .032-.054c.5-5.17-.838-9.67-3.54-13.66a.061.06 0 0 0-.031-.03zM8.02 15.33c-1.18 0-2.15-1.08-2.15-2.41c0-1.33.956-2.41 2.15-2.41c1.21 0 2.17 1.09 2.15 2.42c0 1.33-.956 2.41-2.15 2.41m7.97 0c-1.18 0-2.15-1.08-2.15-2.41c0-1.33.955-2.41 2.15-2.41c1.21 0 2.17 1.09 2.15 2.42c0 1.33-.946 2.41-2.15 2.41"
    />
  </svg>
)

export const ImageEditIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M18.25 3C19.76 3 21 4.23 21 5.75V18.25C21 19.76 19.76 21 18.25 21H5.75C4.23 21 3 19.76 3 18.25V5.75C3 4.23 4.23 3 5.75 3H18.25ZM9.23 13.23C8.55 12.55 7.44 12.55 6.76 13.23L4.5 15.5V18.25C4.5 18.94 5.05 19.5 5.75 19.5H15.5L9.23 13.23ZM15 6.5C13.61 6.5 12.5 7.61 12.5 9C12.5 10.38 13.61 11.5 15 11.5C16.38 11.5 17.5 10.38 17.5 9C17.5 7.61 16.38 6.5 15 6.5Z"
      fill="currentColor"
    />
  </svg>
)

export const CheckCircleIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.47 2 2 6.47 2 12C2 17.52 6.47 22 12 22C17.52 22 22 17.52 22 12C22 6.47 17.52 2 12 2ZM15.58 9.97C15.84 9.65 15.79 9.18 15.47 8.91C15.15 8.65 14.68 8.70 14.41 9.02L10.44 13.88L9.03 12.46C8.73 12.17 8.26 12.17 7.96 12.46C7.67 12.76 7.67 13.23 7.96 13.53L9.96 15.53C10.11 15.68 10.32 15.75 10.53 15.74C10.74 15.73 10.94 15.63 11.08 15.47L15.58 9.97Z"
      fill="currentColor"
    />
  </svg>
)

export const MenuDotsIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <circle cx="3.75" cy="12" r="1" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="20.25" cy="12" r="1" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const WinMinimizeIcon = (props: IconProps): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none" aria-hidden {...props}>
    <path d="M2 6H10" stroke="currentColor" strokeLinecap="square" />
  </svg>
)

export const WinMaximizeIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M20.25 17.05V6.95C20.25 5.82 20.25 5.26 20.03 4.84C19.84 4.46 19.53 4.15 19.15 3.96C18.73 3.75 18.17 3.75 17.05 3.75H6.95C5.82 3.75 5.26 3.75 4.84 3.96C4.46 4.15 4.15 4.46 3.96 4.84C3.75 5.26 3.75 5.82 3.75 6.95V17.05C3.75 18.17 3.75 18.73 3.96 19.15C4.15 19.53 4.46 19.84 4.84 20.03C5.26 20.25 5.82 20.25 6.95 20.25H17.05C18.17 20.25 18.73 20.25 19.15 20.03C19.53 19.84 19.84 19.53 20.03 19.15C20.25 18.73 20.25 18.17 20.25 17.05Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const PinSolidIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      d="M4.01 12.32L7.31 15.62L3.21 19.71C2.92 20.01 2.92 20.48 3.21 20.78C3.51 21.07 3.98 21.07 4.28 20.78L8.37 16.68L11.67 19.98C13.27 21.58 15.99 20.68 16.34 18.46L17.08 13.65C17.14 13.24 17.40 12.89 17.77 12.71L20.52 11.39C22.23 10.57 22.62 8.31 21.28 6.97L17.02 2.71C15.68 1.37 13.42 1.76 12.60 3.47L11.28 6.22C11.10 6.59 10.75 6.85 10.34 6.91L5.53 7.65C3.31 8.00 2.41 10.72 4.01 12.32Z"
      fill="currentColor"
    />
  </svg>
)

export const WinCloseIcon = (props: IconProps): React.JSX.Element => (
  <svg {...base} {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M4.11 4.11C4.60 3.62 5.39 3.62 5.88 4.11L12 10.23L18.11 4.11C18.60 3.62 19.39 3.62 19.88 4.11C20.37 4.60 20.37 5.39 19.88 5.88L13.76 12L19.88 18.11C20.37 18.60 20.37 19.39 19.88 19.88C19.39 20.37 18.60 20.37 18.11 19.88L12 13.76L5.88 19.88C5.39 20.37 4.60 20.37 4.11 19.88C3.62 19.39 3.62 18.60 4.11 18.11L10.23 12L4.11 5.88C3.62 5.39 3.62 4.60 4.11 4.11Z"
      fill="currentColor"
    />
  </svg>
)

export const CmdIcon = (props: IconProps): React.JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 6.5C3 4.56 4.56 3 6.5 3C8.43 3 10 4.56 10 6.5V8.5H14V6.5C14 4.56 15.56 3 17.5 3C19.43 3 21 4.56 21 6.5C21 8.43 19.43 10 17.5 10H15.5V14H17.5C19.43 14 21 15.56 21 17.5C21 19.43 19.43 21 17.5 21C15.56 21 14 19.43 14 17.5V15.5H10V17.5C10 19.43 8.43 21 6.5 21C4.56 21 3 19.43 3 17.5C3 15.56 4.56 14 6.5 14H8.5V10H6.5C4.56 10 3 8.43 3 6.5ZM8.5 8.5V6.5C8.5 5.39 7.60 4.5 6.5 4.5C5.39 4.5 4.5 5.39 4.5 6.5C4.5 7.60 5.39 8.5 6.5 8.5H8.5ZM10 10V14H14V10H10ZM8.5 15.5H6.5C5.39 15.5 4.5 16.39 4.5 17.5C4.5 18.60 5.39 19.5 6.5 19.5C7.60 19.5 8.5 18.60 8.5 17.5V15.5ZM15.5 15.5V17.5C15.5 18.60 16.39 19.5 17.5 19.5C18.60 19.5 19.5 18.60 19.5 17.5C19.5 16.39 18.60 15.5 17.5 15.5H15.5ZM15.5 8.5H17.5C18.60 8.5 19.5 7.60 19.5 6.5C19.5 5.39 18.60 4.5 17.5 4.5C16.39 4.5 15.5 5.39 15.5 6.5V8.5Z"
      fill="currentColor"
    />
  </svg>
)

export const ReturnIcon = (props: IconProps): React.JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
    <g transform="scale(-1 1) translate(-24 0)">
      <path
        d="M17.75 19L21.04 15.70C21.43 15.31 21.43 14.68 21.04 14.29L17.75 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 15L6.75 15C4.54 15 2.75 13.20 2.75 11L2.75 9.75C2.75 7.54 4.54 5.75 6.75 5.75L12.25 5.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
)
