const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store active connections
const rooms = new Map();

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  console.log('New client connected');
  
  // Extract room name from URL
  const roomName = req.url.split('/')[1] || 'default-room';
  
  // Initialize room if it doesn't exist
  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Set());
  }
  
  // Add client to room
  const room = rooms.get(roomName);
  room.add(ws);
  
  // Send connection status
  ws.send(JSON.stringify({ type: 'status', status: 'connected' }));
  
  // Handle messages
  ws.on('message', (message) => {
    // Broadcast message to all clients in the room except sender
    room.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
    room.delete(ws);
    
    // Clean up empty rooms
    if (room.size === 0) {
      rooms.delete(roomName);
    }
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', connections: wss.clients.size });
});

// Start server
const PORT = process.env.PORT || 4321;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
  console.log(`HTTP server is running on http://localhost:${PORT}`);
}); 