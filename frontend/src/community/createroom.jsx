import { useState } from 'react';
import { IoMdAddCircle } from 'react-icons/io';
import PropTypes from 'prop-types';
import RoomFormModal from './RoomFormModal';
import './css/createroom.css';

const CreateRoom = ({ onRoomCreated }) => {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="create-room-bt">
      <button className="create-room-button" onClick={() => setShowForm(true)}>
        <IoMdAddCircle />
        Create Room
      </button>

      <RoomFormModal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSubmitSuccess={onRoomCreated}
      />
    </div>
  );
};

CreateRoom.propTypes = {
  onRoomCreated: PropTypes.func.isRequired,
};

export default CreateRoom;
