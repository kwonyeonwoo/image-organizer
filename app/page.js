"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import Sidebar from "../components/Sidebar";
import ImageGallery from "../components/ImageGallery";

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      } else {
        router.push("/login");
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {/* 1. 왼쪽 사이드바 영역 */}
      <Sidebar 
        user={user} 
        selectedGroupId={selectedGroupId} 
        setSelectedGroupId={setSelectedGroupId} 
      />

      {/* 2. 우측 메인 대시보드 (이미지 갤러리) 영역 */}
      <main className="dashboard-main">
        <div className="dashboard-header">
          <h1 style={{ color: 'var(--point-color)' }}>
            {selectedGroupId ? "이미지 갤러리" : "환영합니다!"}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem", fontWeight: "bold" }}>
              {user?.email}
            </span>
            <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: "0.5rem 1rem" }}>
              로그아웃
            </button>
          </div>
        </div>
        
        {/* 갤러리 및 드래그 보드 컴포넌트 호출 */}
        <ImageGallery 
          user={user} 
          selectedGroupId={selectedGroupId} 
        />
      </main>
    </div>
  );
}
