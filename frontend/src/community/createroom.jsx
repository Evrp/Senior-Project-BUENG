import { useState } from "react";
import { IoMdAddCircle, IoMdCloseCircle } from "react-icons/io";
import api from "../server/api";
import PropTypes from 'prop-types';
import "./css/createroom.css";

const CreateRoom = ({ onRoomCreated }) => {
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [roomData, setRoomData] = useState({
    name: "",
    image: "",
    description: "",
    memberLimit: 50, // ค่าเริ่มต้น
    type: "public", // ค่าเริ่มต้น
    password: "", // เพิ่มฟิลด์รหัสผ่าน
    tags: "", // เก็บเป็น string คั่นด้วย comma
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setRoomData({
      ...roomData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(""); // Clear previous errors

    try {
      // แปลง tags string เป็น array
      const tagsArray = roomData.tags.split(",").map((tag) => tag.trim()).filter(Boolean);

      const res = await api.post(\`/api/createroom\`, {
        ...roomData,
        tags: tagsArray,
        memberLimit: Number(roomData.memberLimit), // แปลงเป็นตัวเลข
      });

      // UX Improvement: ไม่ต้อง reload หน้าเว็บ
      // เรียกใช้ function จาก parent เพื่ออัปเดต UI
      onRoomCreated(res.data);

      // Reset form และปิด popup
      setRoomData({
        name: "",
        image: "",
        description: "",
        memberLimit: 50,
        type: "public",
        password: "",
        tags: "",
      });
      setShowForm(false);
    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการสร้างห้อง:", err);
      if (err.response && err.response.data && err.response.data.error) {
        // แสดง error ที่ได้จาก API
        setError(err.response.data.error);
      } else {
        setError("เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setError(""); // Clear error message when closing
  };

  return (
    <div className="create-room-bt">
      <button className ="create-room-button" onClick={() => setShowForm(!showForm)}>
        {showForm ? <IoMdCloseCircle /> : <IoMdAddCircle />}
        {showForm ? "Cancel" : "Create Room"}
      </button>

      {showForm && (
        <div className="popup-overlay" onClick={handleCloseForm}>
          <div className="popup-form" onClick={(e) => e.stopPropagation()}>
            <h3>Create Room</h3>
            <form onSubmit={handleSubmit}>
              {error && <p className="error-message">{error}</p>}

              {/* --- ชื่อห้อง --- */}
              <input
                type="text"
                className="commu-input"
                name="name"
                placeholder="ชื่อห้อง"
                value={roomData.name}
                onChange={handleChange}
                required
              />

              {/* --- ลิงก์รูปภาพ --- */}
              <input
                type="text"
                name="image"
                className="commu-input"
                placeholder="ลิงก์รูปภาพห้อง"
                value={roomData.image}
                onChange={handleChange}
                required
              />

              {/* แสดง preview ถ้ามีลิงก์รูป */}
              {roomData.image && (
                <div className="image-preview">
                  <img src={roomData.image} alt="Preview" />
                </div>
              )}

              {/* --- รายละเอียด --- */}
              <textarea
                name="description"
                className="commu-input"
                placeholder="รายละเอียดเพิ่มเติม"
                value={roomData.description}
                onChange={handleChange}
              />

              {/* --- จำนวนสมาชิกสูงสุด --- */}
              <label htmlFor="memberLimit">จำนวนสมาชิกสูงสุด:</label>
              <input
                type="number"
                id="memberLimit"
                name="memberLimit"
                className="commu-input"
                value={roomData.memberLimit}
                onChange={handleChange}
                min="1"
                required
              />

              {/* --- ประเภทห้อง --- */}
              <label htmlFor="type">ประเภทห้อง:</label>
              <select
                id="type"
                name="type"
                className="commu-input"
                value={roomData.type}
                onChange={handleChange}
              >
                <option value="public">สาธารณะ (Public)</option>
                <option value="private">ส่วนตัว (Private)</option>
              </select>

              {/* --- รหัสผ่าน (ถ้าเป็นห้องส่วนตัว) --- */}
              {roomData.type === "private" && (
                <>
                  <label htmlFor="password">รหัสผ่านสำหรับเข้าห้อง:</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    className="commu-input"
                    placeholder="ระบุรหัสผ่าน"
                    value={roomData.password}
                    onChange={handleChange}
                    required={roomData.type === "private"}
                  />
                </>
              )}

              {/* --- แท็ก --- */}
              <label htmlFor="tags">แท็ก (คั่นด้วยเครื่องหมาย ,):</label>
              <input
                type="text"
                id="tags"
                name="tags"
                className="commu-input"
                placeholder="เช่น เกม, เรียน, พูดคุย"
                value={roomData.tags}
                onChange={handleChange}
              />

              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "กำลังสร้าง..." : "ยืนยันสร้างห้อง"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

CreateRoom.propTypes = {
  onRoomCreated: PropTypes.func.isRequired,
};

export default CreateRoom;
