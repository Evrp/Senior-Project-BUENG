import { useState, useEffect } from 'react';
import { IoMdCloseCircle } from 'react-icons/io';
import api from '../server/api';
import PropTypes from 'prop-types';
import './css/createroom.css';

const RoomFormModal = ({ isOpen, onClose, onSubmitSuccess, roomToEdit = null }) => {
  const [error, setError] = useState('');
  const [roomData, setRoomData] = useState({
    name: '',
    image: '',
    description: '',
    memberLimit: 50,
    type: 'public',
    password: '',
    tags: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditMode = !!roomToEdit;

  // Populate form if we are in Edit Mode
  useEffect(() => {
    if (roomToEdit) {
      setRoomData({
        name: roomToEdit.name || '',
        image: roomToEdit.image || '',
        description: roomToEdit.description || '',
        memberLimit: roomToEdit.memberLimit || 50,
        type: roomToEdit.type || 'public',
        password: roomToEdit.password || '',
        tags: Array.isArray(roomToEdit.tags) ? roomToEdit.tags.join(', ') : '',
      });
    } else {
      // Reset to defaults for Create Mode
      setRoomData({
        name: '',
        image: '',
        description: '',
        memberLimit: 50,
        type: 'public',
        password: '',
        tags: '',
      });
    }
    setError('');
  }, [roomToEdit, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setRoomData({
      ...roomData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const tagsArray = roomData.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const userEmail = localStorage.getItem('userEmail');

      const payload = {
        ...roomData,
        tags: tagsArray,
        memberLimit: Number(roomData.memberLimit),
        userEmail, // Send userEmail in body to pass requireOwner middleware securely
      };

      let res;
      if (isEditMode) {
        res = await api.put(`/api/editroom/${roomToEdit._id}`, payload);
      } else {
        res = await api.post(`/api/createroom`, payload);
      }

      onSubmitSuccess(res.data);
      onClose();
    } catch (err) {
      console.error(isEditMode ? 'Error updating room:' : 'Error creating room:', err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError('เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-form" onClick={(e) => e.stopPropagation()}>
        <button 
          className="close-popup-btn" 
          onClick={onClose} 
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            fontSize: '1.6rem',
            color: '#888',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IoMdCloseCircle />
        </button>

        <h3>{isEditMode ? 'Edit Room' : 'Create Room'}</h3>
        
        <form onSubmit={handleSubmit} style={{ maxHeight: '75vh', overflowY: 'auto', paddingRight: '4px' }}>
          {error && <p className="error-message" style={{ color: '#ef4444', fontSize: '0.9rem', marginBottom: '10px', textAlign: 'center' }}>{error}</p>}

          {/* --- ชื่อห้อง --- */}
          <label htmlFor="name" style={{ fontWeight: '500', fontSize: '0.9rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>ชื่อห้อง:</label>
          <input
            type="text"
            id="name"
            className="commu-input"
            name="name"
            placeholder="ระบุชื่อห้อง"
            value={roomData.name}
            onChange={handleChange}
            required
          />

          {/* --- ลิงก์รูปภาพ --- */}
          <label htmlFor="image" style={{ fontWeight: '500', fontSize: '0.9rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>ลิงก์รูปภาพห้อง:</label>
          <input
            type="text"
            id="image"
            name="image"
            className="commu-input"
            placeholder="ลิงก์รูปภาพห้อง (URL)"
            value={roomData.image}
            onChange={handleChange}
            required
          />

          {/* แสดง preview ถ้ามีลิงก์รูป */}
          {roomData.image && (
            <div className="image-preview" style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              <img 
                src={roomData.image} 
                alt="Preview" 
                style={{ maxWidth: '100%', maxHeight: '120px', borderRadius: '10px', objectFit: 'cover' }} 
              />
            </div>
          )}

          {/* --- รายละเอียด --- */}
          <label htmlFor="description" style={{ fontWeight: '500', fontSize: '0.9rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>รายละเอียดเพิ่มเติม:</label>
          <textarea
            id="description"
            name="description"
            className="commu-input"
            placeholder="รายละเอียดเพิ่มเติมเกี่ยวกับห้องแชท"
            value={roomData.description}
            onChange={handleChange}
            style={{ minHeight: '80px', resize: 'vertical' }}
          />

          {/* --- จำนวนสมาชิกสูงสุด --- */}
          <label htmlFor="memberLimit" style={{ fontWeight: '500', fontSize: '0.9rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>จำนวนสมาชิกสูงสุด:</label>
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
          <label htmlFor="type" style={{ fontWeight: '500', fontSize: '0.9rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>ประเภทห้อง:</label>
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
          {roomData.type === 'private' && (
            <>
              <label htmlFor="password" style={{ fontWeight: '500', fontSize: '0.9rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>รหัสผ่านสำหรับเข้าห้อง:</label>
              <input
                type="password"
                id="password"
                name="password"
                className="commu-input"
                placeholder="ระบุรหัสผ่านห้องส่วนตัว"
                value={roomData.password}
                onChange={handleChange}
                required={roomData.type === 'private'}
              />
            </>
          )}

          {/* --- แท็ก --- */}
          <label htmlFor="tags" style={{ fontWeight: '500', fontSize: '0.9rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>แท็ก (คั่นด้วยเครื่องหมาย ,):</label>
          <input
            type="text"
            id="tags"
            name="tags"
            className="commu-input"
            placeholder="เช่น เกม, เรียน, พูดคุย"
            value={roomData.tags}
            onChange={handleChange}
          />

          <button type="submit" disabled={isSubmitting} style={{ marginTop: '12px' }}>
            {isSubmitting 
              ? (isEditMode ? 'กำลังบันทึก...' : 'กำลังสร้าง...') 
              : (isEditMode ? 'บันทึกการแก้ไข' : 'ยืนยันสร้างห้อง')}
          </button>
        </form>
      </div>
    </div>
  );
};

RoomFormModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmitSuccess: PropTypes.func.isRequired,
  roomToEdit: PropTypes.object,
};

export default RoomFormModal;
