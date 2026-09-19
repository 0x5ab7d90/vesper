import { createElement } from 'react'
import {
  IconUnitedStates,
  IconSpain,
  IconFrance,
  IconGermany,
  IconItaly,
  IconBrazil,
  IconJapan,
  IconSouthKorea,
  IconChina,
  IconRussia,
  IconSaudiArabia,
  IconIndia,
  IconNetherlands,
  IconPoland,
  IconSweden,
  IconTurkey,
  IconDenmark,
  IconFinland,
  IconNorway,
  IconCzechia,
  IconHungary,
  IconRomania,
  IconBulgaria,
  IconCroatia,
  IconSerbia,
  IconSlovakia,
  IconSlovenia,
  IconUkraine,
  IconIsrael,
  IconVietnam,
  IconThailand,
  IconIndonesia,
  IconMalaysia,
  IconPhilippines,
  IconBangladesh,
  IconPakistan,
  IconIran,
  IconGeorgia,
  IconArmenia,
  IconNorthMacedonia,
  IconAlbania,
  IconLithuania,
  IconLatvia,
  IconEstonia,
  IconIceland,
  IconIreland,
  IconUnitedKingdom,
  IconMalta,
  IconGreece,
  IconBosniaHerzegovina,
  IconMexico,
  type IconProps
} from 'nucleo-flags'
import { langLabel, langToCountry } from '@renderer/lib/lang'

const COUNTRY_TO_FLAG: Record<string, React.FC<IconProps>> = {
  us: IconUnitedStates,
  es: IconSpain,
  fr: IconFrance,
  de: IconGermany,
  it: IconItaly,
  br: IconBrazil,
  jp: IconJapan,
  kr: IconSouthKorea,
  cn: IconChina,
  ru: IconRussia,
  sa: IconSaudiArabia,
  in: IconIndia,
  nl: IconNetherlands,
  pl: IconPoland,
  se: IconSweden,
  tr: IconTurkey,
  dk: IconDenmark,
  fi: IconFinland,
  no: IconNorway,
  cz: IconCzechia,
  hu: IconHungary,
  ro: IconRomania,
  bg: IconBulgaria,
  hr: IconCroatia,
  rs: IconSerbia,
  sk: IconSlovakia,
  si: IconSlovenia,
  ua: IconUkraine,
  il: IconIsrael,
  vn: IconVietnam,
  th: IconThailand,
  id: IconIndonesia,
  my: IconMalaysia,
  ph: IconPhilippines,
  bd: IconBangladesh,
  pk: IconPakistan,
  ir: IconIran,
  ge: IconGeorgia,
  am: IconArmenia,
  mk: IconNorthMacedonia,
  al: IconAlbania,
  lt: IconLithuania,
  lv: IconLatvia,
  ee: IconEstonia,
  is: IconIceland,
  ie: IconIreland,
  gb: IconUnitedKingdom,
  mt: IconMalta,
  gr: IconGreece,
  ba: IconBosniaHerzegovina,
  mx: IconMexico
}

/**
 * The audio language as a flag. A language with no flag of its own shows its
 * code in small caps on the same tile, so the row still says what it is.
 */
export function FlagTile({ lang }: { lang: string }): React.JSX.Element {
  const country = langToCountry(lang)
  const flag = country ? COUNTRY_TO_FLAG[country] : undefined
  return (
    <div
      className="flex h-4 w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-[2px] bg-white/[0.08]"
      title={langLabel(lang)}
    >
      {flag ? (
        createElement(flag, { width: 22, height: 16, preserveAspectRatio: 'xMidYMid slice' })
      ) : (
        <span className="text-[8px] leading-none font-semibold tracking-[0.08em] text-text-tertiary uppercase">
          {lang.slice(0, 3)}
        </span>
      )}
    </div>
  )
}
