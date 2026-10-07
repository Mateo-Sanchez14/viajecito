import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as icons from "./icons";

describe("icons barrel", () => {
  it("renders an svg on the server without any provider", () => {
    const html = renderToStaticMarkup(<icons.HouseSimpleIcon />);

    expect(html).toMatch(/^<svg/);
  });

  it("passes aria-hidden through to the svg", () => {
    const html = renderToStaticMarkup(<icons.WalletIcon aria-hidden="true" size={22} />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('width="22"');
  });

  it("supports the fill weight used by the active navigation item", () => {
    const regular = renderToStaticMarkup(<icons.LightbulbIcon />);
    const fill = renderToStaticMarkup(<icons.LightbulbIcon weight="fill" />);

    expect(fill).not.toBe(regular);
  });

  it.each([
    "HouseSimpleIcon",
    "LightbulbIcon",
    "CalendarBlankIcon",
    "ListChecksIcon",
    "MapTrifoldIcon",
    "SunHorizonIcon",
    "WalletIcon",
    "FileTextIcon",
    "MountainsIcon",
    "SquaresFourIcon",
    "DotsThreeIcon",
    "PlusIcon",
    "LinkSimpleIcon",
    "TagIcon",
    "CheckSquareIcon",
    "UsersThreeIcon",
    "SuitcaseRollingIcon",
    "WarningCircleIcon",
    "ArrowClockwiseIcon",
    "CameraIcon",
    "TrashIcon",
    "XIcon",
    "CaretRightIcon",
    "CaretLeftIcon",
    "BedIcon",
    "ChatCircleIcon",
    "DownloadSimpleIcon",
    "EyeIcon",
    "IdentificationCardIcon",
    "ImageIcon",
    "LockIcon",
    "MinusIcon",
    "PencilSimpleIcon",
    "ShieldCheckIcon",
    "ThumbsDownIcon",
    "ThumbsUpIcon",
    "TicketIcon",
    "AirplaneTiltIcon",
    "ArrowSquareOutIcon",
  ])("exports %s", (name) => {
    expect((icons as Record<string, unknown>)[name]).toBeDefined();
  });
});
