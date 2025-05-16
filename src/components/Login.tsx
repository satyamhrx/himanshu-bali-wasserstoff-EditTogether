import React, { useState } from 'react';
import './Login.css';

interface LoginProps {
  onLogin: (username: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onLogin(username.trim());
    }
  };

  return (
    <div className="login-bg">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-title">Welcome to Edit Together</div>
        <input
          className="login-input"
          type="text"
          placeholder="Enter your name..."
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoFocus
        />
        <button className="login-button" type="submit">
          Join
        </button>
      </form>
    </div>
  );
};

export default Login;