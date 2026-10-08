import { LoginBackdropContainer } from "@/features/auth/containers/LoginBackdropContainer";
import { LoginFlow } from "@/features/auth/containers/LoginFlow";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;

  return (
    <>
      <LoginBackdropContainer />
      <LoginFlow next={typeof next === "string" ? next : null} />
    </>
  );
}
