import type { ComponentType } from 'react'
import type { SvgIconProps } from '@mui/material/SvgIcon'
import HomeRounded from '@mui/icons-material/HomeRounded'
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded'
import RefreshRounded from '@mui/icons-material/RefreshRounded'
import AddRounded from '@mui/icons-material/AddRounded'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import DownloadRounded from '@mui/icons-material/DownloadRounded'
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded'
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded'
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded'
import LightModeRounded from '@mui/icons-material/LightModeRounded'
import DarkModeRounded from '@mui/icons-material/DarkModeRounded'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import AttachFileRounded from '@mui/icons-material/AttachFileRounded'
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import ShuffleRounded from '@mui/icons-material/ShuffleRounded'
import ShieldOutlined from '@mui/icons-material/ShieldOutlined'
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined'
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined'
import ScheduleSendOutlined from '@mui/icons-material/ScheduleSendOutlined'
import MenuRounded from '@mui/icons-material/MenuRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded'
import VolumeOffRounded from '@mui/icons-material/VolumeOffRounded'
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded'
import DashboardOutlined from '@mui/icons-material/DashboardOutlined'
import TuneRounded from '@mui/icons-material/TuneRounded'
import DnsOutlined from '@mui/icons-material/DnsOutlined'
import LanguageRounded from '@mui/icons-material/LanguageRounded'
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import PublicRounded from '@mui/icons-material/PublicRounded'
import VpnKeyOutlined from '@mui/icons-material/VpnKeyOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import LockOpenOutlined from '@mui/icons-material/LockOpenOutlined'
import LogoutRounded from '@mui/icons-material/LogoutRounded'
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined'
import CodeRounded from '@mui/icons-material/CodeRounded'
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded'
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded'
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded'
import DraftsOutlined from '@mui/icons-material/DraftsOutlined'
import MarkEmailUnreadOutlined from '@mui/icons-material/MarkEmailUnreadOutlined'
import AllInboxOutlined from '@mui/icons-material/AllInboxOutlined'
import InboxOutlined from '@mui/icons-material/InboxOutlined'
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded'
import DateRangeRounded from '@mui/icons-material/DateRangeRounded'
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded'
import ShowChartRounded from '@mui/icons-material/ShowChartRounded'

export type IconName =
  | 'home'
  | 'copy'
  | 'check'
  | 'check-circle'
  | 'refresh-cw'
  | 'plus'
  | 'trash-2'
  | 'download'
  | 'file-down'
  | 'bell'
  | 'bell-ring'
  | 'sun'
  | 'moon'
  | 'arrow-left'
  | 'paperclip'
  | 'external-link'
  | 'file-text'
  | 'book-open'
  | 'sparkles'
  | 'shuffle'
  | 'shield'
  | 'shield-check'
  | 'shield-cog'
  | 'clock-shield'
  | 'menu'
  | 'x'
  | 'volume-2'
  | 'volume-x'
  | 'qr'
  | 'layout-dashboard'
  | 'sliders'
  | 'server'
  | 'globe'
  | 'chevron-down'
  | 'search'
  | 'arrow-right'
  | 'globe-plus'
  | 'key'
  | 'lock'
  | 'unlock'
  | 'log-out'
  | 'badge-check'
  | 'code-2'
  | 'scan-code'
  | 'alert-triangle'
  | 'mail'
  | 'brand-mail'
  | 'mail-open'
  | 'mail-plus'
  | 'mails'
  | 'inbox'
  | 'clock'
  | 'calendar-range'
  | 'trending-up'
  | 'activity'

const ICON_MAP: Record<Exclude<IconName, 'brand-mail'>, ComponentType<SvgIconProps>> = {
  home: HomeRounded,
  copy: ContentCopyRounded,
  check: CheckRounded,
  'check-circle': CheckCircleOutlineRounded,
  'refresh-cw': RefreshRounded,
  plus: AddRounded,
  'trash-2': DeleteOutlineRounded,
  download: DownloadRounded,
  'file-down': FileDownloadRounded,
  bell: NotificationsNoneRounded,
  'bell-ring': NotificationsActiveRounded,
  sun: LightModeRounded,
  moon: DarkModeRounded,
  'arrow-left': ArrowBackRounded,
  paperclip: AttachFileRounded,
  'external-link': OpenInNewRounded,
  'file-text': DescriptionOutlined,
  'book-open': MenuBookOutlined,
  sparkles: AutoAwesomeRounded,
  shuffle: ShuffleRounded,
  shield: ShieldOutlined,
  'shield-check': VerifiedUserOutlined,
  'shield-cog': AdminPanelSettingsOutlined,
  'clock-shield': ScheduleSendOutlined,
  menu: MenuRounded,
  x: CloseRounded,
  'volume-2': VolumeUpRounded,
  'volume-x': VolumeOffRounded,
  qr: QrCode2Rounded,
  'layout-dashboard': DashboardOutlined,
  sliders: TuneRounded,
  server: DnsOutlined,
  globe: LanguageRounded,
  'chevron-down': KeyboardArrowDownRounded,
  search: SearchRounded,
  'arrow-right': ArrowForwardRounded,
  'globe-plus': PublicRounded,
  key: VpnKeyOutlined,
  lock: LockOutlined,
  unlock: LockOpenOutlined,
  'log-out': LogoutRounded,
  'badge-check': VerifiedOutlined,
  'code-2': CodeRounded,
  'scan-code': QrCodeScannerRounded,
  'alert-triangle': WarningAmberRounded,
  mail: MailOutlineRounded,
  'mail-open': DraftsOutlined,
  'mail-plus': MarkEmailUnreadOutlined,
  mails: AllInboxOutlined,
  inbox: InboxOutlined,
  clock: AccessTimeRounded,
  'calendar-range': DateRangeRounded,
  'trending-up': TrendingUpRounded,
  activity: ShowChartRounded,
}

export interface AppIconProps extends SvgIconProps {
  name: IconName
}

export function AppIcon({ name, className, sx, ...rest }: AppIconProps) {
  if (name === 'brand-mail') {
    return (
      <svg
        className={className ? `app-icon ${className}` : 'app-icon'}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M22 13v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9" />
        <path d="m2 8 8.97 5.7a1.94 1.94 0 0 0 2.06 0L16 11.8" />
        <path d="m19.5 2-2.5 4h4L18.5 10" />
      </svg>
    )
  }

  const Component = ICON_MAP[name]
  return (
    <Component
      aria-hidden="true"
      className={className ? `app-icon ${className}` : 'app-icon'}
      fontSize="small"
      sx={[
        { fontSize: '1.125rem', flexShrink: 0 },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
      {...rest}
    />
  )
}
