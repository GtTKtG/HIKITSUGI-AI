"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      style={{ fontSize: 13, color: "#777", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
    >
      ログアウト
    </button>
  );
}
