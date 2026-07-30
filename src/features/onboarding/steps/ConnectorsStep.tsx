import { Plug } from 'lucide-react'
import { GDriveConnectorRow } from '@/features/gdrive/GDriveConnectorRow'
import { BrightDataConnectorRow } from '@/features/scraping/BrightDataConnectorRow'
import { TelegramSettings } from '@/features/telegram/TelegramSettings'
import { t } from '@/lib/i18n'

export function ConnectorsStep() {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-white">Connecteurs</h3>
        <p className="text-xs text-white/50 mt-0.5">
          {t('connectorsStep.connectYourExternal')}
        </p>
      </div>
      <GDriveConnectorRow />
      <BrightDataConnectorRow />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 px-1 pt-1 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
          <Plug className="w-3 h-3 text-cyan-400/70" /> Telegram
        </div>
        <div className="bg-white/[0.03] rounded-xl p-3">
          <TelegramSettings />
        </div>
      </div>
    </div>
  )
}
