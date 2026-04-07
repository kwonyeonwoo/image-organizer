"use client";

import { useState, useEffect } from "react";
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc, getDocs } from "firebase/firestore";
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
      groupData.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      
      setGroups(groupData);
      
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
      setSelectedGroupId(docRef.id);
    } catch (err) {
      console.error("폴더 생성 에러:", err);
      alert("폴더 생성 중 에러가 발생했습니다.");
    } finally {
      setIsCreating(false);
    }
  };

  // 폴더 수정 핸들러
  const handleEditGroup = async (e, groupId, currentName) => {
    e.stopPropagation(); // 부모 아이템 클릭을 막습니다
    const promptName = window.prompt("바꿀 폴더 이름을 입력하세요:", currentName);
    if (promptName && promptName.trim() !== "" && promptName !== currentName) {
      try {
        await updateDoc(doc(db, "groups", groupId), {
          name: promptName.trim()
        });
      } catch (err) {
        console.error("수정 에러:", err);
        alert("이름 수정에 실패했습니다.");
      }
    }
  };

  // 폴더 삭제 핸들러 (연쇄 파괴 포함 - 확인창 즉시 패스)
  const handleDeleteGroup = async (e, groupId, groupName) => {
    e.stopPropagation(); // 부모 아이템 클릭 방지
    
    try {
      // 1. 해당 폴더 안의 이미지들(DB 기록) 모두 가져와서 파기
      const q = query(collection(db, "images"), where("groupId", "==", groupId));
      const imageSnapshots = await getDocs(q);
      
      const getPublicIdFromUrl = (url) => {
        const parts = url.split('/upload/');
        if (parts.length < 2) return null;
        const pathPart = parts[1].split('/').slice(1).join('/'); 
        return pathPart.substring(0, pathPart.lastIndexOf('.'));
      };

      const deletePromises = imageSnapshots.docs.map(async (imgDoc) => {
        const imgData = imgDoc.data();
        const publicId = getPublicIdFromUrl(imgData.url);
        if (publicId) {
          fetch("/api/delete-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_id: publicId })
          }).catch(console.error);
        }
        return deleteDoc(doc(db, "images", imgDoc.id));
      });

      await Promise.all(deletePromises);

      // 2. 텅 빈 폴더 최종 삭제
      await deleteDoc(doc(db, "groups", groupId));

      if (selectedGroupId === groupId) {
        setSelectedGroupId(null);
      }
    } catch (err) {
      console.error("삭제 에러:", err);
      // alert는 실패시에만 남깁니다
      alert("폴더 삭제에 실패했습니다.");
    }
  };

  const [dragOverGroupId, setDragOverGroupId] = useState(null);

  const handleDragOverGroup = (e, groupId) => {
    e.preventDefault();
    if (groupId === selectedGroupId) return;
    setDragOverGroupId(groupId);
  };

  const handleDragLeaveGroup = () => {
    setDragOverGroupId(null);
  };

  const handleDropToGroup = async (e, targetGroupId) => {
    e.preventDefault();
    setDragOverGroupId(null);

    const imageId = e.dataTransfer.getData("imageId");
    if (!imageId || targetGroupId === selectedGroupId) return;

    try {
      await updateDoc(doc(db, "images", imageId), {
        groupId: targetGroupId,
        orderIndex: Date.now() // 이동 시 해당 그룹의 상단 근처로 배치(기본값)
      });
    } catch (err) {
      console.error("그룹 이동 실패:", err);
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
              className={`sidebar-item ${selectedGroupId === group.id ? "active" : ""} ${dragOverGroupId === group.id ? "drag-over" : ""}`}
              onClick={() => setSelectedGroupId(group.id)}
              onDragOver={(e) => handleDragOverGroup(e, group.id)}
              onDragLeave={handleDragLeaveGroup}
              onDrop={(e) => handleDropToGroup(e, group.id)}
            >
              <div className="sidebar-item-content">
                <span>📁 {group.name}</span>
              </div>
              <div className="sidebar-item-actions">
                {/* 각 버튼 클릭 시 뷰어로도 작동하지 않게 이벤트 위임(e.stopPropagation) 적용 */}
                <button title="수정" onClick={(e) => handleEditGroup(e, group.id, group.name)}>✏️</button>
                <button title="삭제" onClick={(e) => handleDeleteGroup(e, group.id, group.name)}>🗑️</button>
              </div>
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
