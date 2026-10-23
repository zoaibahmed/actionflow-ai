import {
  NotebookPen,
  Timer,
  ChartNoAxesColumnIncreasing,
  CalendarDays,
  ListTodo,
  ScanLine,
  Sparkles,
  Settings2,
  ArrowUpRight,
  Plus,
  Search,
  Bell,
  ChevronRight,
  Menu,
  X,
  Clock3,
  Check,
  PanelLeftClose,
  Flag,
  LoaderCircle,
  CircleHelp,
  LogOut,
  ArrowRight,
  ChevronDown,
  MoreHorizontal,
  ArrowDown,
  CircleCheck,
  Inbox,
} from "lucide-react";
import type { SVGProps } from "react";
const icons = {
  notes: NotebookPen,
  focus: Timer,
  insights: ChartNoAxesColumnIncreasing,
  today: CalendarDays,
  tasks: ListTodo,
  capture: ScanLine,
  spark: Sparkles,
  settings: Settings2,
  arrow: ArrowUpRight,
  plus: Plus,
  search: Search,
  bell: Bell,
  chevron: ChevronRight,
  menu: Menu,
  close: X,
  clock: Clock3,
  check: Check,
  panel: PanelLeftClose,
  flag: Flag,
  loading: LoaderCircle,
  help: CircleHelp,
  logout: LogOut,
  right: ArrowRight,
  down: ChevronDown,
  more: MoreHorizontal,
  scroll: ArrowDown,
  complete: CircleCheck,
  inbox: Inbox,
};
export type IconName = keyof typeof icons;
export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  const Component = icons[name];
  return (
    <Component
      width={20}
      height={20}
      strokeWidth={1.65}
      aria-hidden="true"
      {...props}
    />
  );
}
