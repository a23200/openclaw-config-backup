const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));

function randomCover(seed = '') {
  const covers = [
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80',
  ];
  const index = Math.abs(String(seed).split('').reduce((n, ch) => n + ch.charCodeAt(0), 0)) % covers.length;
  return covers[index];
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      broadcaster: null,
      broadcasterName: '',
      title: '',
      cover: '',
      viewers: new Set(),
      chat: [],
      createdAt: Date.now(),
    });
  }
  return rooms.get(roomId);
}

function serializeRoom(room) {
  return {
    roomId: room.roomId,
    title: room.title || `${room.roomId} 的直播间`,
    cover: room.cover || randomCover(room.roomId),
    broadcasterName: room.broadcasterName || '匿名主播',
    viewerCount: room.viewers.size,
    live: Boolean(room.broadcaster),
    createdAt: room.createdAt,
  };
}

function roomList() {
  return [...rooms.values()]
    .filter((room) => room.broadcaster || room.viewers.size > 0)
    .sort((a, b) => Number(Boolean(b.broadcaster)) - Number(Boolean(a.broadcaster)) || b.createdAt - a.createdAt)
    .map(serializeRoom);
}

function emitRoomList() {
  io.emit('rooms-updated', roomList());
}

function emitRoomMeta(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit('room-meta', serializeRoom(room));
}

function pushSystemMessage(room, text) {
  const message = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sender: '系统',
    role: 'system',
    text,
    createdAt: Date.now(),
  };
  room.chat.push(message);
  room.chat = room.chat.slice(-50);
  io.to(room.roomId).emit('chat-message', message);
}

function cleanupRoomIfEmpty(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (!room.broadcaster && room.viewers.size === 0) {
    rooms.delete(roomId);
    emitRoomList();
  }
}

function leaveRoom(socket, { notify = true } = {}) {
  const { role, roomId, displayName } = socket.data || {};
  if (!roomId) return;

  const room = rooms.get(roomId);
  socket.leave(roomId);
  socket.data.roomId = null;
  socket.data.role = null;

  if (!room) {
    emitRoomList();
    return;
  }

  if (role === 'broadcaster' && room.broadcaster === socket.id) {
    room.broadcaster = null;
    for (const viewerId of room.viewers) {
      io.to(viewerId).emit('broadcast-ended');
    }
    if (notify) pushSystemMessage(room, `${displayName || '主播'} 下播了`);
    emitRoomMeta(roomId);
  }

  if (role === 'viewer' && room.viewers.has(socket.id)) {
    room.viewers.delete(socket.id);
    if (room.broadcaster) {
      io.to(room.broadcaster).emit('viewer-left', { viewerId: socket.id });
    }
    if (notify) pushSystemMessage(room, `${displayName || '一位观众'} 离开了直播间`);
    emitRoomMeta(roomId);
  }

  emitRoomList();
  cleanupRoomIfEmpty(roomId);
}

app.get('/api/rooms', (req, res) => {
  res.json({ rooms: roomList() });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, rooms: roomList().length, timestamp: Date.now() });
});

io.on('connection', (socket) => {
  socket.emit('rooms-updated', roomList());

  socket.on('join-as-broadcaster', ({ roomId, title, cover, displayName }) => {
    if (!roomId) return;

    leaveRoom(socket, { notify: false });

    const room = getRoom(roomId);
    room.broadcaster = socket.id;
    room.broadcasterName = displayName || '匿名主播';
    room.title = title || `${roomId} 的直播间`;
    room.cover = cover || randomCover(roomId);

    socket.data.role = 'broadcaster';
    socket.data.roomId = roomId;
    socket.data.displayName = room.broadcasterName;
    socket.join(roomId);

    for (const viewerId of room.viewers) {
      io.to(viewerId).emit('broadcaster-ready', {
        broadcasterId: socket.id,
        room: serializeRoom(room),
      });
      socket.emit('viewer-joined', { viewerId });
    }

    emitRoomMeta(roomId);
    socket.emit('chat-history', room.chat);
    pushSystemMessage(room, `${room.broadcasterName} 开播了`);

    socket.emit('room-status', {
      roomId,
      role: 'broadcaster',
      viewerCount: room.viewers.size,
      room: serializeRoom(room),
    });

    emitRoomList();
  });

  socket.on('join-as-viewer', ({ roomId, displayName }) => {
    if (!roomId) return;

    leaveRoom(socket, { notify: false });

    const room = getRoom(roomId);
    room.viewers.add(socket.id);

    socket.data.role = 'viewer';
    socket.data.roomId = roomId;
    socket.data.displayName = displayName || '匿名观众';
    socket.join(roomId);

    if (room.broadcaster) {
      io.to(room.broadcaster).emit('viewer-joined', { viewerId: socket.id });
      socket.emit('broadcaster-ready', {
        broadcasterId: room.broadcaster,
        room: serializeRoom(room),
      });
    }

    socket.emit('room-status', {
      roomId,
      role: 'viewer',
      hasBroadcaster: Boolean(room.broadcaster),
      room: serializeRoom(room),
    });

    socket.emit('room-meta', serializeRoom(room));
    socket.emit('chat-history', room.chat);
    pushSystemMessage(room, `${socket.data.displayName} 进入了直播间`);
    emitRoomMeta(roomId);
    emitRoomList();
  });

  socket.on('send-chat-message', ({ roomId, text }) => {
    if (!roomId || !text || !String(text).trim()) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const message = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      sender: socket.data.displayName || '匿名用户',
      role: socket.data.role || 'guest',
      text: String(text).trim().slice(0, 300),
      createdAt: Date.now(),
    };

    room.chat.push(message);
    room.chat = room.chat.slice(-50);
    io.to(roomId).emit('chat-message', message);
  });

  socket.on('leave-room', () => {
    leaveRoom(socket, { notify: true });
    socket.emit('left-room');
  });

  socket.on('webrtc-offer', ({ targetId, sdp }) => {
    io.to(targetId).emit('webrtc-offer', {
      fromId: socket.id,
      sdp,
    });
  });

  socket.on('webrtc-answer', ({ targetId, sdp }) => {
    io.to(targetId).emit('webrtc-answer', {
      fromId: socket.id,
      sdp,
    });
  });

  socket.on('webrtc-ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('webrtc-ice-candidate', {
      fromId: socket.id,
      candidate,
    });
  });

  socket.on('disconnect', () => {
    leaveRoom(socket, { notify: true });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Live MVP running at http://localhost:${PORT}`);
});
