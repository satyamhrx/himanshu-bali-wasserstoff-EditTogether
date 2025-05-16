import React from 'react';
import './ChangeHistory.css';

interface Change {
  id: string;
  user: string;
  userColor: string;
  content: string;
  timestamp: Date;
}

interface ChangeHistoryProps {
  changes: Change[];
}

const ChangeHistory: React.FC<ChangeHistoryProps> = ({ changes }) => {
  return (
    <div className="change-history">
      <h3 className="change-history-title">Recent Changes</h3>
      <div className="changes-list">
        {changes.map((change) => (
          <div key={change.id} className="change-item">
            <div className="change-header">
              <div 
                className="user-indicator"
                style={{ backgroundColor: change.userColor }}
              />
              <span className="user-name">{change.user}</span>
              <span className="timestamp">
                {change.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <div className="change-content">{change.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChangeHistory;