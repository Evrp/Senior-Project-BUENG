import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import "./css/community.css";
import CreateRoom from "./createroom";
import RoomList from "./roomlist";
import RequireLogin from "../components/RequireLogin";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import api from "../server/api";
import { useTheme } from "../context/themecontext";
// import RoomMatch from "./roommatch";
import HeaderProfile from "../components/HeaderProfile";

// --- API Helper Functions ---
const fetchAllRooms = () => api.get(`/api/allrooms`).then((res) => res.data);
const fetchAllUsers = () => api.get(`/api/users`).then((res) => res.data);
const fetchUserFilters = (email) => api.get(`/api/filters/${email}`).then(res => res.data);
const fetchUserInfos = (email) => api.get(`/api/infos/${email}`).then(res => res.data);

const Newcommu = () => {
  const queryClient = useQueryClient();
  const { isDarkMode } = useTheme();
  const userEmail = localStorage.getItem("userEmail");

  const [showOnlyMyRooms, setShowOnlyMyRooms] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  // const [handlematchfriend, setHandleMatchFriend] = useState(false);
  const dropdownRefs = useRef({});

  // 1. Replaced all fetch functions with useQuery
  const { data: rooms = [], isLoading: isLoadingRooms } = useQuery({
    queryKey: ["rooms"],
    queryFn: fetchAllRooms,
    staleTime: 1000 * 60 * 2,
  });
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: fetchAllUsers,
    staleTime: 1000 * 60 * 2,
  });
  useQuery({
    queryKey: ["filters", userEmail],
    queryFn: () => fetchUserFilters(userEmail),
    enabled: !!userEmail,
    staleTime: 1000 * 60 * 5,
  });
  useQuery({
    queryKey: ["infos", userEmail],
    queryFn: () => fetchUserInfos(userEmail),
    enabled: !!userEmail,
    staleTime: 1000 * 60 * 5,
  });

  // 2. Replaced delete function with useMutation
  const deleteRoomsMutation = useMutation({
    mutationFn: (roomIds) =>
      api.post(`/api/delete-rooms`, { selectedRooms: roomIds }),
    onSuccess: (_, deletedIds) => {
      toast.success(`ลบห้องสำเร็จ ${deletedIds.length} ห้อง`);
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setSelectedRooms([]);
      setIsDeleteMode(false);
    },
    onError: (error) => {
      console.error("Error deleting rooms:", error);
      toast.error("เกิดข้อผิดพลาดในการลบห้อง");
    },
  });

  // 3. Derived state with useMemo instead of useEffect and useState
  useMemo(() => {
    if (!users.length || !userEmail) return [];
    const currentUser = users.find((u) => u.email === userEmail);
    if (!currentUser || !Array.isArray(currentUser.friends)) return [];
    const friendEmails = currentUser.friends.map((f) =>
      typeof f === "string" ? f : f.email
    );
    return users
      .filter((user) => friendEmails.includes(user.email))
      .map((user) => ({ ...user, isOnline: user.isOnline || false }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users, userEmail]);

  const handleNewRoom = (newRoom) => {
    // Let React Query handle state updates via invalidation from the creation mutation (if any)
    // Or for optimistic updates:
    queryClient.setQueryData(["rooms"], (oldData) => Array.isArray(oldData) ? [...oldData, newRoom] : [newRoom]);
  };

  const handleDeleteSelectedRooms = () => {
    if (selectedRooms.length === 0)
      return toast.warning("กรุณาเลือกห้องที่ต้องการลบ");
    if (
      window.confirm(
        `คุณแน่ใจว่าต้องการลบ ${selectedRooms.length} ห้องหรือไม่?`
      )
    ) {
      deleteRoomsMutation.mutate(selectedRooms);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      // handleCloseModal is not defined in this scope, removing the call.
      const isClickInsideAny = Object.values(dropdownRefs.current).some((ref) =>
        ref?.contains(e.target)
      );
      if (!isClickInsideAny) /* setOpenMenuFor(null); */ ; // setOpenMenuFor is not defined in this scope
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <RequireLogin>
      <div className={`main-content-com ${isDarkMode ? "dark-mode" : ""}`}>
        <header className="header-home">
          <HeaderProfile />
        </header>
        <div className="filter-container">
          <CreateRoom onRoomCreated={handleNewRoom} />
          <button
            className={"filter-button" + (showOnlyMyRooms ? " active" : "")}
            onClick={() => setShowOnlyMyRooms(!showOnlyMyRooms)}
          >
            {showOnlyMyRooms ? "All rooms" : "My rooms"}
          </button>
          {(showOnlyMyRooms || selectedRooms.length > 0) && (
            <button
              className={`delete-button-all-room ${
                isDeleteMode ? "active" : ""
              }`}
              onClick={() => {
                if (showOnlyMyRooms) {
                  setIsDeleteMode(!isDeleteMode);
                  if (isDeleteMode) setSelectedRooms([]);
                } else {
                  toast.warning(
                    "สามารถลบห้องได้เฉพาะในโหมด 'My rooms' เท่านั้น"
                  );
                }
              }}
            >
              {isDeleteMode
                ? `ยกเลิก (${selectedRooms.length})`
                : selectedRooms.length > 0
                ? `ลบห้อง (${selectedRooms.length})`
                : "ลบห้อง"}
            </button>
          )}
          {isDeleteMode && selectedRooms.length > 0 && (
            <button
              className="confirm-delete-button"
              onClick={handleDeleteSelectedRooms}
              disabled={deleteRoomsMutation.isPending}
            >
              {deleteRoomsMutation.isPending
                ? "กำลังลบ..."
                : `ยืนยันการลบ (${selectedRooms.length})`}
            </button>
          )}
        </div>
        <div className="container-content">
          <RoomList
            rooms={rooms} // Pass query data to child
            isLoading={isLoadingRooms}
            showOnlyMyRooms={showOnlyMyRooms}
            isDeleteMode={isDeleteMode}
            selectedRooms={selectedRooms}
            setSelectedRooms={setSelectedRooms}
          />
        </div>
      </div>
    </RequireLogin>
  );
};

export default Newcommu;
