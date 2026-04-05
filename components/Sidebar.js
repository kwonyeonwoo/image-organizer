"use client";

import { useState, useEffect } from "react";
import { collection, addDoc, query, where, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function Sidebar({ user, selectedGroupId, setSelectedGroupId }) {
  const [groups, setGroups] = useState([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // 현재 유저의 폴더(그룹) 목록 실시간 가져오기
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(collection(db, "groups"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const groupData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // 생성일(createdAt) 기준으로 정렬 (최근 생성순 등, 필요에 맞춰 설정)
      groupData.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      
      setGroups(groupData);
      
      // 만약 선택된 그룹이 없는데 그룹이 하나라도 있다면, 첫 번째 그룹을 자동 선택합니다.
      if (!selectedGroupId && groupData.length > 0) {
        setSelectedGroupId(groupData[0].id);
      }
    });

    return () => unsubscribe();
  }, [user, selectedGroupId, setSelectedGroupId]);

  const handleAddGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim() || !user) return;

    try {
      setIsCreating(true);
      const docRef = await addDoc(collection(db, "groups"), {
        name: newGroupName.trim(),
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
      setNewGroupName("");
      setSelectedGroupId(docRef.id); // 방금 만든 그룹으로 바로 선택 이동
    } catch (err) {
      console.error("폴더 생성 에러:", err);
      alert("폴더 생성 중 에러가 발생했습니다.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>내 폴더</h2>
      </div>

      <div className="sidebar-list">
        {groups.length === 0 ? (
          <p className="sidebar-empty">첫 폴더를 만들어주세요!</p>
        ) : (
          groups.map((group) => (
            <div
              key={group.id}
              className={`sidebar-item ${selectedGroupId === group.id ? "active" : ""}`}
              onClick={() => setSelectedGroupId(group.id)}
            >
              📁 {group.name}
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleAddGroup} className="sidebar-footer">
        <input
          type="text"
          placeholder="새 폴더 이름..."
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          className="input-field"
          style={{ padding: "0.5rem", fontSize: "0.9rem" }}
          required
        />
        <button type="submit" className="btn btn-primary" style={{ padding: "0.5rem", width: "100%", marginTop: "0.5rem" }} disabled={isCreating}>
          + 그룹 만들기
        </button>
      </form>
    </aside>
  );
}
