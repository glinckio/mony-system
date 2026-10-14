import type { LucideIcon } from 'lucide-react-native';
import ArrowDown from 'lucide-react-native/icons/arrow-down';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Baby from 'lucide-react-native/icons/baby';
import Banknote from 'lucide-react-native/icons/banknote';
import Bell from 'lucide-react-native/icons/bell';
import Calendar from 'lucide-react-native/icons/calendar';
import Camera from 'lucide-react-native/icons/camera';
import Car from 'lucide-react-native/icons/car';
import ChartColumn from 'lucide-react-native/icons/chart-column';
import ChartPie from 'lucide-react-native/icons/chart-pie';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Circle from 'lucide-react-native/icons/circle';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleMinus from 'lucide-react-native/icons/circle-minus';
import CircleQuestionMark from 'lucide-react-native/icons/circle-question-mark';
import Clock from 'lucide-react-native/icons/clock';
import CreditCard from 'lucide-react-native/icons/credit-card';
import Download from 'lucide-react-native/icons/download';
import Dumbbell from 'lucide-react-native/icons/dumbbell';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import FileText from 'lucide-react-native/icons/file-text';
import FingerprintPattern from 'lucide-react-native/icons/fingerprint-pattern';
import Gamepad2 from 'lucide-react-native/icons/gamepad-2';
import Gift from 'lucide-react-native/icons/gift';
import GraduationCap from 'lucide-react-native/icons/graduation-cap';
import Hamburger from 'lucide-react-native/icons/hamburger';
import HeartPulse from 'lucide-react-native/icons/heart-pulse';
import House from 'lucide-react-native/icons/house';
import Landmark from 'lucide-react-native/icons/landmark';
import Laptop from 'lucide-react-native/icons/laptop';
import Lightbulb from 'lucide-react-native/icons/lightbulb';
import List from 'lucide-react-native/icons/list';
import ListFilter from 'lucide-react-native/icons/list-filter';
import Lock from 'lucide-react-native/icons/lock';
import LogOut from 'lucide-react-native/icons/log-out';
import Mail from 'lucide-react-native/icons/mail';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Mic from 'lucide-react-native/icons/mic';
import Paperclip from 'lucide-react-native/icons/paperclip';
import PawPrint from 'lucide-react-native/icons/paw-print';
import Pencil from 'lucide-react-native/icons/pencil';
import PiggyBank from 'lucide-react-native/icons/piggy-bank';
import Plane from 'lucide-react-native/icons/plane';
import Plus from 'lucide-react-native/icons/plus';
import QrCode from 'lucide-react-native/icons/qr-code';
import Receipt from 'lucide-react-native/icons/receipt';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Repeat from 'lucide-react-native/icons/repeat';
import ScanText from 'lucide-react-native/icons/scan-text';
import Search from 'lucide-react-native/icons/search';
import SendHorizontal from 'lucide-react-native/icons/send-horizontal';
import Settings from 'lucide-react-native/icons/settings';
import Shield from 'lucide-react-native/icons/shield';
import Sheet from 'lucide-react-native/icons/sheet';
import Shirt from 'lucide-react-native/icons/shirt';
import ShoppingBag from 'lucide-react-native/icons/shopping-bag';
import ShoppingCart from 'lucide-react-native/icons/shopping-cart';
import Tag from 'lucide-react-native/icons/tag';
import Target from 'lucide-react-native/icons/target';
import Trash from 'lucide-react-native/icons/trash';
import TrendingUp from 'lucide-react-native/icons/trending-up';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import User from 'lucide-react-native/icons/user';
import Wallet from 'lucide-react-native/icons/wallet';
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
  baby: Baby,
  banknote: Banknote,
  bell: Bell,
  calendar: Calendar,
  camera: Camera,
  car: Car,
  'chart-column': ChartColumn,
  'chart-pie': ChartPie,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  circle: Circle,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  'circle-minus': CircleMinus,
  'circle-question-mark': CircleQuestionMark,
  clock: Clock,
  'credit-card': CreditCard,
  download: Download,
  dumbbell: Dumbbell,
  ellipsis: Ellipsis,
  eye: Eye,
  'eye-off': EyeOff,
  'file-text': FileText,
  'fingerprint-pattern': FingerprintPattern,
  'gamepad-2': Gamepad2,
  gift: Gift,
  'graduation-cap': GraduationCap,
  hamburger: Hamburger,
  'heart-pulse': HeartPulse,
  house: House,
  landmark: Landmark,
  laptop: Laptop,
  lightbulb: Lightbulb,
  list: List,
  'list-filter': ListFilter,
  lock: Lock,
  'log-out': LogOut,
  mail: Mail,
  'message-circle': MessageCircle,
  mic: Mic,
  paperclip: Paperclip,
  'paw-print': PawPrint,
  pencil: Pencil,
  'piggy-bank': PiggyBank,
  plane: Plane,
  plus: Plus,
  'qr-code': QrCode,
  receipt: Receipt,
  'refresh-cw': RefreshCw,
  repeat: Repeat,
  'scan-text': ScanText,
  search: Search,
  'send-horizontal': SendHorizontal,
  settings: Settings,
  shield: Shield,
  sheet: Sheet,
  shirt: Shirt,
  'shopping-bag': ShoppingBag,
  'shopping-cart': ShoppingCart,
  tag: Tag,
  target: Target,
  trash: Trash,
  'trending-up': TrendingUp,
  'triangle-alert': TriangleAlert,
  user: User,
  wallet: Wallet,
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
