"use client";

import { useTranslations } from "next-intl";
import { useAmbientAllowed } from "@/shared/lib/useAmbientAllowed";
import { ambientClip } from "@/ui/ambient/scenes";
import { AmbientVideo } from "@/ui/molecules/AmbientVideo";
import { LoginBackdrop } from "@/ui/organisms/LoginBackdrop";

/** The scene shown behind the login card. */
const LOGIN_SCENE = "beach";

/**
 * Container: puts the beach loop behind the login card. Reduced motion or Save-Data keep the poster
 * only; with no clip in the manifest nothing renders and the plain login canvas shows instead.
 */
export function LoginBackdropContainer() {
  const t = useTranslations("app");
  const allowMotion = useAmbientAllowed();
  const clip = ambientClip(LOGIN_SCENE);

  if (!clip) return null;
  return <LoginBackdrop brand={t("name")} media={<AmbientVideo src={clip.mp4} poster={clip.poster} play={allowMotion} />} />;
}
