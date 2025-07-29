import React from 'react';
import { ringCollection } from '../../../utils/ringCollection'; // Import dữ liệu từ file data
import './RingSelector.css'; // File CSS cho component này

// Component này nhận một prop là onSelectRing để báo cho component cha biết nhẫn nào đã được chọn.
const RingSelector = ({ onSelectRing, selectedRingId }) => {
    return (
        <div className="ring-selector-container">
            <p className="selector-title">Choose a Ring</p>
            <div className="ring-list">
                {ringCollection.map(ring => (
                    <div
                        key={ring.id}
                        className={`ring-item ${selectedRingId === ring.id ? 'selected' : ''}`}
                        onClick={() => onSelectRing(ring)} // Khi click, gọi hàm từ props
                    >
                        <img src={ring.image} alt={ring.name} />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RingSelector;