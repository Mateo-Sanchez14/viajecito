/**
 * The only module that imports Phosphor. The `/ssr` entry has no React context, so these
 * icons render in server components, client components and `renderToStaticMarkup` alike.
 * One weight family app-wide (regular); `fill` is reserved for the active bottom-nav item.
 * Decorative icons must be passed `aria-hidden="true"` by the caller.
 */
import type { ComponentProps } from "react";
import { HouseSimpleIcon } from "@phosphor-icons/react/ssr";

export { HouseSimpleIcon };
export {
  AirplaneTiltIcon,
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CalendarBlankIcon,
  CameraIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckSquareIcon,
  DotsThreeIcon,
  FileTextIcon,
  LightbulbIcon,
  LinkSimpleIcon,
  ListChecksIcon,
  MapTrifoldIcon,
  MountainsIcon,
  PlusIcon,
  SquaresFourIcon,
  SuitcaseRollingIcon,
  SunHorizonIcon,
  TagIcon,
  TrashIcon,
  UsersThreeIcon,
  WalletIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";

/** Props every barrel icon accepts (size, weight, color, aria-*, ...). */
export type IconProps = ComponentProps<typeof HouseSimpleIcon>;
