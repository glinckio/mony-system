import type { LucideIcon } from 'lucide-react-native';
import ArrowDown from 'lucide-react-native/icons/arrow-down';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Bell from 'lucide-react-native/icons/bell';
import Calendar from 'lucide-react-native/icons/calendar';
import Camera from 'lucide-react-native/icons/camera';
import ChartColumn from 'lucide-react-native/icons/chart-column';
import ChartPie from 'lucide-react-native/icons/chart-pie';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleQuestionMark from 'lucide-react-native/icons/circle-question-mark';
import Clock from 'lucide-react-native/icons/clock';
import CreditCard from 'lucide-react-native/icons/credit-card';
import Download from 'lucide-react-native/icons/download';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import FingerprintPattern from 'lucide-react-native/icons/fingerprint-pattern';
import House from 'lucide-react-native/icons/house';
import Landmark from 'lucide-react-native/icons/landmark';
import List from 'lucide-react-native/icons/list';
import ListFilter from 'lucide-react-native/icons/list-filter';
import Lock from 'lucide-react-native/icons/lock';
import LogOut from 'lucide-react-native/icons/log-out';
import Mail from 'lucide-react-native/icons/mail';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Mic from 'lucide-react-native/icons/mic';
import Paperclip from 'lucide-react-native/icons/paperclip';
import Pencil from 'lucide-react-native/icons/pencil';
import Plus from 'lucide-react-native/icons/plus';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import ScanText from 'lucide-react-native/icons/scan-text';
import Search from 'lucide-react-native/icons/search';
import SendHorizontal from 'lucide-react-native/icons/send-horizontal';
import Settings from 'lucide-react-native/icons/settings';
import Shield from 'lucide-react-native/icons/shield';
import ShoppingBag from 'lucide-react-native/icons/shopping-bag';
import Tag from 'lucide-react-native/icons/tag';
import Target from 'lucide-react-native/icons/target';
import Trash from 'lucide-react-native/icons/trash';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import User from 'lucide-react-native/icons/user';
import WifiOff from 'lucide-react-native/icons/wifi-off';
import X from 'lucide-react-native/icons/x';
import Zap from 'lucide-react-native/icons/zap';

import { cores } from './tokens';

/**
 * Ícones do design do cliente: Lucide, traço 2 (T-017). Cada ícone é importado pelo caminho dele,
 * para o bundle levar só os usados; ícone novo entra nesta lista.
 */
const ICONES = {
  'arrow-down': ArrowDown,
  'arrow-left': ArrowLeft,
  'arrow-left-right': ArrowLeftRight,
  'arrow-up': ArrowUp,
  bell: Bell,
  calendar: Calendar,
  camera: Camera,
  'chart-column': ChartColumn,
  'chart-pie': ChartPie,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'circle-alert': CircleAlert,
  'circle-question-mark': CircleQuestionMark,
  clock: Clock,
  'credit-card': CreditCard,
  download: Download,
  ellipsis: Ellipsis,
  eye: Eye,
  'eye-off': EyeOff,
  'fingerprint-pattern': FingerprintPattern,
  house: House,
  landmark: Landmark,
  list: List,
  'list-filter': ListFilter,
  lock: Lock,
  'log-out': LogOut,
  mail: Mail,
  'message-circle': MessageCircle,
  mic: Mic,
  paperclip: Paperclip,
  pencil: Pencil,
  plus: Plus,
  'refresh-cw': RefreshCw,
  'scan-text': ScanText,
  search: Search,
  'send-horizontal': SendHorizontal,
  settings: Settings,
  shield: Shield,
  'shopping-bag': ShoppingBag,
  tag: Tag,
  target: Target,
  trash: Trash,
  'triangle-alert': TriangleAlert,
  user: User,
  'wifi-off': WifiOff,
  x: X,
  zap: Zap,
} satisfies Record<string, LucideIcon>;

export type NomeIcone = keyof typeof ICONES;

export interface PropsIcone {
  nome: NomeIcone;
  /** Em pt. */
  tamanho?: number;
  cor?: string;
  espessura?: number;
}

/** Ícone decorativo: quem dá o nome ao leitor de tela é o botão ou o texto ao lado. */
export function Icone({ nome, tamanho = 20, cor = cores.texto, espessura = 2 }: PropsIcone) {
  const Desenho = ICONES[nome];
  return (
    <Desenho
      size={tamanho}
      color={cor}
      strokeWidth={espessura}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
