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

  // 폴더 삭제 핸들러 (연쇄 파괴 포함)
  const handleDeleteGroup = async (e, groupId, groupName) => {
    e.stopPropagation(); // 부모 아이템 클릭 방지
    const confirmDelete = window.confirm(`정말로 '${groupName}' 폴더를 삭제할까요?\n이 폴더 안의 모든 사진도 덩달아 영구 삭제됩니다.`);
    
    if (confirmDelete) {
      try {
        // 1. 해당 폴더 안의 이미지들(DB 기록) 모두 가져와서 파기
        const q = query(collection(db, "images"), where("groupId", "==", groupId));
        const imageSnapshots = await getDocs(q);
        
        // 원본 파일을 지우기 위해 추출 함수
        const getPublicIdFromUrl = (url) => {
          const parts = url.split('/upload/');
          if (parts.length < 2) return null;
          const pathPart = parts[1].split('/').slice(1).join('/'); // remove 'v1234567/' part
          return pathPart.substring(0, pathPart.lastIndexOf('.'));
        };

        // 이미지 하나하나 DB 지우면서 Cloudinary 원본도 지우기 API 쏘기
        const deletePromises = imageSnapshots.docs.map(async (imgDoc) => {
          const imgData = imgDoc.data();
          
          // API에 요청보내서 원본삭제
          const publicId = getPublicIdFromUrl(imgData.url);
          if (publicId) {
            // 실패하더라도 넘어가도록 catch
            fetch("/api/delete-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ public_id: publicId })
            }).catch(console.error);
          }

          // DB 문서 삭제
          return deleteDoc(doc(db, "images", imgDoc.id));
        });

        await Promise.all(deletePromises);

        // 2. 텅 빈 폴더 최종 삭제
        await deleteDoc(doc(db, "groups", groupId));

        // 3. 삭제된 폴더를 현재 보고 있었다면 선택 해제
        if (selectedGroupId === groupId) {
          setSelectedGroupId(null);
        }
      } catch (err) {
        console.error("삭제 에러:", err);
        alert("폴더 삭제에 실패했습니다.");
      }
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
